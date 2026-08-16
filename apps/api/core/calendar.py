from datetime import datetime, time, timedelta, timezone

from supabase import Client

# Fallback for any date with no library_calendar row — every day defaults
# to an open school day until real holiday/break data is entered. See
# migrations/0010_phase4_returns.sql.
DEFAULT_OPEN_TIME = time(8, 0)
DEFAULT_CLOSE_TIME = time(17, 0)

# Fine-rate constants (build plan 4.4) — hourly-rate collection types get
# charged for open library hours elapsed; everything else is general
# circulation, charged per school day.
HOURLY_FINE_COLLECTION_TYPES = {"Reserve", "Story book", "Bible"}
DAILY_FINE_RATE = 5.0
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
    # The due date's own calendar day isn't a day overdue yet — a book is
    # only overdue once that day has passed. So this walks the day *after*
    # start's date through end's date, inclusive.
    d = start.date() + timedelta(days=1)
    while d <= end.date():
        yield d
        d += timedelta(days=1)


def count_school_days(db: Client, start: datetime, end: datetime) -> int:
    """School days elapsed between start and end — the ₱5/day general rate."""
    if end <= start:
        return 0
    calendar = _calendar_rows(db, start, end)
    count = 0
    for d in _dates_after_start(start, end):
        row = calendar.get(d.isoformat())
        is_school_day = row["is_school_day"] if row else True
        if is_school_day:
            count += 1
    return count


def count_library_hours(db: Client, start: datetime, end: datetime) -> float:
    """Open library hours elapsed between start and end — the ₱2/hour
    Reserve/Story book/Bible rate. A day-level approximation (full
    open->close hours per school day), not minute-exact within the first
    or last day — documented as a placeholder until real policy is set."""
    if end <= start:
        return 0.0
    calendar = _calendar_rows(db, start, end)
    total = 0.0
    for d in _dates_after_start(start, end):
        row = calendar.get(d.isoformat())
        is_school_day = row["is_school_day"] if row else True
        if not is_school_day:
            continue
        open_time = _parse_time(row["open_time"]) if row else DEFAULT_OPEN_TIME
        close_time = _parse_time(row["close_time"]) if row else DEFAULT_CLOSE_TIME
        hours = (datetime.combine(d, close_time) - datetime.combine(d, open_time)).total_seconds() / 3600
        total += max(hours, 0.0)
    return total


def compute_fine(db: Client, due_date_iso: str, collection_type: str) -> tuple[int, float]:
    """Returns (days_overdue, fine_amount) for an open loan, as of now.
    days_overdue is always day-based (for display); fine_amount uses
    whichever rate applies to the collection type. Shared by
    routers/loans.py (live previews at the return counter) and
    core/reports.py (the Overdue report) — one implementation, so the
    two can't quietly drift apart on what "overdue" or "owed" means."""
    due_date = datetime.fromisoformat(due_date_iso)
    now = datetime.now(timezone.utc)
    days_overdue = count_school_days(db, due_date, now)
    if days_overdue == 0:
        return 0, 0.0
    if collection_type in HOURLY_FINE_COLLECTION_TYPES:
        fine = round(count_library_hours(db, due_date, now) * HOURLY_FINE_RATE, 2)
    else:
        fine = round(days_overdue * DAILY_FINE_RATE, 2)
    return days_overdue, fine
