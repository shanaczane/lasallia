# Manila (UTC+8, no daylight saving) dates for reports and exports. A date
# picked on screen means a whole Manila day.

import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

MANILA = timezone(timedelta(hours=8))
_DATE_ONLY = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def manila_day_bounds(date_from: date, date_to: date) -> tuple[datetime, datetime]:
    """Whole days in Manila time, both ends included, as [start, end) in UTC."""
    start = datetime.combine(date_from, time.min, tzinfo=MANILA)
    end = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=MANILA)
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)


def utc_text(moment: datetime) -> str:
    """A UTC timestamp for a query filter. "Z" rather than "+00:00", so no
    "+" ends up in a URL."""
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def parse_timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def manila_now() -> datetime:
    return datetime.now(MANILA)


def _as_manila(value: str | datetime) -> datetime:
    moment = parse_timestamp(value) if isinstance(value, str) else value
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(MANILA)


def date_text(value: str | datetime) -> str:
    """"November 14, 2026" in Manila time."""
    moment = _as_manila(value)
    return f"{moment:%B} {moment.day}, {moment.year}"


def time_text(value: str | datetime) -> str:
    """"5:00 PM" in Manila time."""
    moment = _as_manila(value)
    return f"{moment.hour % 12 or 12}:{moment:%M} {'AM' if moment.hour < 12 else 'PM'}"


def school_days_text(days: int) -> str:
    return f"Overdue by {days} school day{'' if days == 1 else 's'}"


def library_hours_text(hours: float) -> str:
    shown = round(hours, 1)
    return f"Overdue by {shown:g} library hour{'' if shown == 1 else 's'}"


def overdue_text(school_days: int, library_hours: float, hourly: bool) -> str:
    """Past the due time, but no school day or library hour has gone by yet
    reads "Overdue today"."""
    if hourly and library_hours > 0:
        return library_hours_text(library_hours)
    if not hourly and school_days > 0:
        return school_days_text(school_days)
    return "Overdue today"


def manila_date_text(value: str | None) -> str:
    """'2026-11-03T15:30:00+00:00' -> '2026-11-03' (the Manila date)."""
    if not value:
        return ""
    if _DATE_ONLY.match(value):
        return value
    return parse_timestamp(value).astimezone(MANILA).date().isoformat()


def report_bound(value: str | None, *, end: bool) -> str | None:
    """A report filter's date_from / date_to, for gte / lte filters.

    "2026-11-30" (a day picked on screen) becomes the first instant of that
    Manila day, or with end=True its last instant, so the whole day is in.
    Full timestamps from older pages pass through unchanged."""
    if not value or not _DATE_ONLY.match(value):
        return value
    day = date.fromisoformat(value)
    start, next_day = manila_day_bounds(day, day)
    return utc_text(next_day - timedelta(microseconds=1) if end else start)


# ─── Chart buckets that follow the report period ────────────────────────

@dataclass
class PeriodBucket:
    label: str
    start: datetime  # UTC, included
    end: datetime    # UTC, not included


def filter_days(date_from: str | None, date_to: str | None) -> tuple[date | None, date | None]:
    """The Manila dates of a report filter's bounds (as report_bound made
    them): the first day and the last day, both included."""
    first = parse_timestamp(date_from).astimezone(MANILA).date() if date_from else None
    last = parse_timestamp(date_to).astimezone(MANILA).date() if date_to else None
    return first, last


def _month_start(day: date) -> date:
    return day.replace(day=1)


def _add_months(day: date, months: int) -> date:
    index = day.year * 12 + day.month - 1 + months
    return date(index // 12, index % 12 + 1, 1)


def period_buckets(first: date | None, last: date | None, *, default: str = "month", default_count: int = 6) -> list[PeriodBucket]:
    """Chart buckets for a period, in Manila time: days for up to 31 days,
    weeks (from Sunday) for up to 26 weeks, months beyond that. Without
    dates, the last `default_count` months or weeks ending today."""
    today = manila_now().date()
    last = last or today
    defaulted = first is None
    if first is None:
        if default == "week":
            this_sunday = last - timedelta(days=(last.isoweekday() % 7))
            first = this_sunday - timedelta(weeks=default_count - 1)
        else:
            first = _add_months(_month_start(last), -(default_count - 1))
    if first > last:
        first, last = last, first

    span = (last - first).days + 1
    starts: list[date] = []
    if defaulted:
        # No dates picked: the default's own unit (the last 6 months, or 8 weeks).
        span = 10_000 if default == "month" else min(span, 26 * 7)
    if span <= 31:
        unit = "day"
        starts = [first + timedelta(days=i) for i in range((last - first).days + 1)]
    elif span <= 26 * 7:
        unit = "week"
        sunday = first - timedelta(days=(first.isoweekday() % 7))
        cursor = sunday
        while cursor <= last:
            starts.append(max(cursor, first))
            cursor += timedelta(weeks=1)
    else:
        unit = "month"
        cursor = _month_start(first)
        while cursor <= last:
            starts.append(max(cursor, first))
            cursor = _add_months(cursor, 1)

    many_years = first.year != last.year
    buckets = []
    for i, start in enumerate(starts):
        end = starts[i + 1] if i + 1 < len(starts) else last + timedelta(days=1)
        if unit == "month":
            label = start.strftime("%b %Y") if many_years else start.strftime("%b")
        else:
            label = f"{start.strftime('%b')} {start.day}"
        lo, _ = manila_day_bounds(start, start)
        hi, _ = manila_day_bounds(end, end)
        buckets.append(PeriodBucket(label=label, start=lo, end=hi))
    return buckets


def bucket_index(buckets: list[PeriodBucket], moment: datetime) -> int | None:
    for i, b in enumerate(buckets):
        if b.start <= moment < b.end:
            return i
    return None
