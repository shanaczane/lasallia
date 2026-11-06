# Manila (UTC+8, no daylight saving) dates for reports and exports. A date
# picked on screen means a whole Manila day.

import re
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
