from datetime import date, datetime, time, timedelta, timezone

from supabase import Client

from core.settings import get_library_settings

# These collections are fined per open library hour. Everything else is
# fined per school day at Settings' rate, up to the per-book maximum. The
# hourly rate isn't in Settings yet, so it's fixed here.
HOURLY_FINE_COLLECTION_TYPES = {"Reserve", "Story book", "Bible"}
HOURLY_FINE_RATE = 2.0


def _parse_time(value: str) -> time:
    return time.fromisoformat(value)


def _calendar_rows(db: Client, start: datetime, end: datetime) -> dict[str, dict]:
    rows = (
        db.table("library_calendar")
        .select("date, is_school_day, open_time, close_time")
        .gte("date", start.date().isoformat())
        .lte("date", end.date().isoformat())
        .execute()
    ).data
    return {row["date"]: row for row in rows}


def _dates_after_start(start: datetime, end: datetime):
    # The due date itself doesn't count as overdue, so start the day after.
    d = start.date() + timedelta(days=1)
    while d <= end.date():
        yield d
        d += timedelta(days=1)


def _weekly_hours(cfg: dict, d: date) -> tuple[time | None, time | None]:
    """Settings' opening hours for that day of the week. None/None means
    closed, so no fine builds up that day."""
    weekday = d.weekday()  # Monday = 0 ... Sunday = 6
    if weekday <= 4:
        open_key, close_key = "weekday_open_time", "weekday_close_time"
    elif weekday == 5:
        open_key, close_key = "saturday_open_time", "saturday_close_time"
    else:
        open_key, close_key = "sunday_open_time", "sunday_close_time"
    open_str, close_str = cfg.get(open_key), cfg.get(close_key)
    if not open_str or not close_str:
        return None, None
    return _parse_time(open_str), _parse_time(close_str)


def _day_hours(cfg: dict, calendar: dict[str, dict], d: date) -> tuple[time | None, time | None]:
    """Opening hours for one date: a library_calendar entry (e.g. a
    holiday) if there is one, else the weekly schedule. None/None = closed."""
    row = calendar.get(d.isoformat())
    if row:
        if not row["is_school_day"]:
            return None, None
        return _parse_time(row["open_time"]), _parse_time(row["close_time"])
    return _weekly_hours(cfg, d)


def count_school_days(db: Client, start: datetime, end: datetime, cfg: dict) -> int:
    """Days between start and end when the library was open. The daily
    fine only counts these."""
    if end <= start:
        return 0
    calendar = _calendar_rows(db, start, end)
    count = 0
    for d in _dates_after_start(start, end):
        open_time, close_time = _day_hours(cfg, calendar, d)
        if open_time is not None:
            count += 1
    return count


def count_library_hours(db: Client, start: datetime, end: datetime, cfg: dict) -> float:
    """Open library hours between start and end, for the hourly fine.
    Counts whole open days only (not minute-exact) until the policy is final."""
    if end <= start:
        return 0.0
    calendar = _calendar_rows(db, start, end)
    total = 0.0
    for d in _dates_after_start(start, end):
        open_time, close_time = _day_hours(cfg, calendar, d)
        if open_time is None or close_time is None:
            continue
        hours = (datetime.combine(d, close_time) - datetime.combine(d, open_time)).total_seconds() / 3600
        total += max(hours, 0.0)
    return total


def compute_fine(db: Client, due_date_iso: str, collection_type: str) -> tuple[int, float]:
    """(days_overdue, fine_amount) for an open loan as of now. Used by both
    the return counter and the Overdue report, so they always agree."""
    due_date = datetime.fromisoformat(due_date_iso)
    now = datetime.now(timezone.utc)
    cfg = get_library_settings(db)
    days_overdue = count_school_days(db, due_date, now, cfg)
    if days_overdue == 0:
        return 0, 0.0
    if collection_type in HOURLY_FINE_COLLECTION_TYPES:
        fine = round(count_library_hours(db, due_date, now, cfg) * HOURLY_FINE_RATE, 2)
    else:
        fine = round(days_overdue * cfg["fine_per_day"], 2)
    fine = min(fine, cfg["max_fine_per_book"])
    return days_overdue, fine
