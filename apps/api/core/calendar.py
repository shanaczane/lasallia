from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

from supabase import Client

from core.dates import MANILA, overdue_text
from core.settings import get_library_settings

# These collections are fined per open library hour. Everything else is
# fined per school day at Settings' rate, up to the per-book maximum. The
# hourly rate isn't in Settings yet, so it's fixed here.
HOURLY_FINE_COLLECTION_TYPES = {"Reserve", "Story book", "Bible"}
HOURLY_FINE_RATE = 2.0

_LONGEST_CLOSURE_DAYS = 60
# Only if the library has no hours on the due date at all.
_FALLBACK_CLOSE = time(17, 0)


def _parse_time(value: str) -> time:
    return time.fromisoformat(value)


def _manila_date(moment: datetime) -> date:
    # School days are Manila days. A UTC date is the day before until 8:00 AM.
    return moment.astimezone(MANILA).date()


def _calendar_rows(db: Client, start: datetime, end: datetime) -> dict[str, dict]:
    rows = (
        db.table("library_calendar")
        .select("date, is_school_day, open_time, close_time")
        .gte("date", _manila_date(start).isoformat())
        .lte("date", _manila_date(end).isoformat())
        .execute()
    ).data
    return {row["date"]: row for row in rows}


def _dates_after_start(start: datetime, end: datetime):
    # The due date itself doesn't count as overdue, so start the day after.
    d = _manila_date(start) + timedelta(days=1)
    last = _manila_date(end)
    while d <= last:
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


def next_school_day(db: Client, day: date, cfg: dict) -> date:
    """`day`, or the first school day after it. Gives `day` back if the library
    is closed for the whole stretch, so a loan can still be made."""
    last = day + timedelta(days=_LONGEST_CLOSURE_DAYS)
    calendar = _calendar_rows(
        db, datetime.combine(day, time.min, tzinfo=MANILA), datetime.combine(last, time.min, tzinfo=MANILA),
    )
    d = day
    while d <= last:
        if _day_hours(cfg, calendar, d)[0] is not None:
            return d
        d += timedelta(days=1)
    return day


def loan_due_date(db: Client, borrowed_at: datetime, cfg: dict, collection_type: str | None) -> datetime:
    """Closing time on the last day of the loan period, moved to the next
    school day if that day is closed."""
    hourly = collection_type in HOURLY_FINE_COLLECTION_TYPES
    period = cfg["reserve_loan_period_days"] if hourly else cfg["standard_loan_period_days"]
    day = next_school_day(db, _manila_date(borrowed_at) + timedelta(days=period), cfg)
    calendar = _calendar_rows(
        db, datetime.combine(day, time.min, tzinfo=MANILA), datetime.combine(day, time.min, tzinfo=MANILA),
    )
    close_time = _day_hours(cfg, calendar, day)[1] or _FALLBACK_CLOSE
    return datetime.combine(day, close_time, tzinfo=MANILA)


def school_days_between(db: Client, start: datetime, end: datetime, cfg: dict) -> list[date]:
    """The days after start, up to end, when the library was open. The
    daily fine only counts these."""
    if end <= start:
        return []
    calendar = _calendar_rows(db, start, end)
    return [d for d in _dates_after_start(start, end) if _day_hours(cfg, calendar, d)[0] is not None]


def count_school_days(db: Client, start: datetime, end: datetime, cfg: dict) -> int:
    return len(school_days_between(db, start, end, cfg))


def count_library_hours(db: Client, start: datetime, end: datetime, cfg: dict) -> float:
    """Open library hours between start and end, to the minute, for the
    hourly fine. Only the part of each day inside opening hours counts."""
    if end <= start:
        return 0.0
    calendar = _calendar_rows(db, start, end)
    total = 0.0
    d = _manila_date(start)
    last = _manila_date(end)
    while d <= last:
        open_time, close_time = _day_hours(cfg, calendar, d)
        if open_time is not None and close_time is not None:
            counted_from = max(start, datetime.combine(d, open_time, tzinfo=MANILA))
            counted_to = min(end, datetime.combine(d, close_time, tzinfo=MANILA))
            total += max((counted_to - counted_from).total_seconds() / 3600, 0.0)
        d += timedelta(days=1)
    return total


@dataclass
class OverdueStatus:
    school_days: int
    # Only worked out for the hourly collections.
    library_hours: float
    fine: float


def overdue_status(db: Client, due_date_iso: str, collection_type: str) -> OverdueStatus:
    """How overdue an open loan is as of now, and its fine so far.

    Hourly collections: open library hours since the due time x HOURLY_FINE_RATE.
    Everything else: school days after the due date x fine_per_day.
    Both stop at max_fine_per_book."""
    due_date = datetime.fromisoformat(due_date_iso)
    now = datetime.now(timezone.utc)
    cfg = get_library_settings(db)
    days_overdue = count_school_days(db, due_date, now, cfg)
    hours = 0.0
    if collection_type in HOURLY_FINE_COLLECTION_TYPES:
        hours = count_library_hours(db, due_date, now, cfg)
        fine = round(hours * HOURLY_FINE_RATE, 2)
    else:
        fine = round(days_overdue * cfg["fine_per_day"], 2)
    return OverdueStatus(days_overdue, hours, min(fine, cfg["max_fine_per_book"]))


def overdue_fields(db: Client, due_date_iso: str, collection_type: str) -> dict:
    """The fields of an open loan that say how overdue it is."""
    status = overdue_status(db, due_date_iso, collection_type)
    past_due = datetime.fromisoformat(due_date_iso) < datetime.now(timezone.utc)
    return {
        "days_overdue": status.school_days,
        "preview_fine_amount": status.fine,
        "overdue_label": overdue_text(
            status.school_days, status.library_hours, collection_type in HOURLY_FINE_COLLECTION_TYPES,
        ) if past_due else None,
    }


def late_fee_breakdown(db: Client, due_date_iso: str, returned_at_iso: str, collection_type: str, cfg: dict) -> dict:
    """What a returned loan's late fee was counted from, for "Why this
    amount?": the library days (or hours) charged, the rate and the cap.
    Uses today's Settings, so the screen checks it against the stored fine
    before showing the sum."""
    due = datetime.fromisoformat(due_date_iso)
    returned = datetime.fromisoformat(returned_at_iso)
    hourly = collection_type in HOURLY_FINE_COLLECTION_TYPES
    return {
        "late_days_charged": [d.isoformat() for d in school_days_between(db, due, returned, cfg)],
        "late_hours_charged": round(count_library_hours(db, due, returned, cfg), 2) if hourly else None,
        "late_fee_rate": HOURLY_FINE_RATE if hourly else cfg["fine_per_day"],
        "late_fee_cap": cfg["max_fine_per_book"],
    }


def compute_fine(db: Client, due_date_iso: str, collection_type: str) -> tuple[int, float]:
    """(days_overdue, fine_amount) for an open loan as of now. Used by both
    the return counter and the Overdue report, so they always agree."""
    status = overdue_status(db, due_date_iso, collection_type)
    return status.school_days, status.fine
