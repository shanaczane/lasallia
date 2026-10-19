"""Chatbot tool: the library's opening hours.

Reads the hours librarians set in Settings (the same ones fines use), not
the handbook, whose hours table comes out garbled.
"""

from datetime import datetime, time, timedelta, timezone

from core.calendar import _calendar_rows, _day_hours, _parse_time
from core.settings import get_library_settings
from core.supabase import get_admin_client

MANILA = timezone(timedelta(hours=8))

_GROUPS = (
    ("Monday – Friday", "weekday"),
    ("Saturday", "saturday"),
    ("Sunday", "sunday"),
)


def _fmt(t: time) -> str:
    return t.strftime("%I:%M %p").lstrip("0")


def _range(open_t: time | None, close_t: time | None) -> str:
    if open_t is None or close_t is None:
        return "Closed"
    return f"{_fmt(open_t)} – {_fmt(close_t)}"


def get_library_hours() -> dict:
    admin = get_admin_client()
    cfg = get_library_settings(admin)

    schedule = []
    for label, key in _GROUPS:
        open_str, close_str = cfg.get(f"{key}_open_time"), cfg.get(f"{key}_close_time")
        if open_str and close_str:
            hours = _range(_parse_time(open_str), _parse_time(close_str))
        else:
            hours = "Closed"
        schedule.append({"days": label, "hours": hours})

    # Today can differ from the weekly schedule when library_calendar has
    # an override (holiday, special closure) for this date.
    now = datetime.now(MANILA)
    calendar = _calendar_rows(admin, now, now)
    today_open, today_close = _day_hours(cfg, calendar, now.date())

    return {
        "schedule": schedule,
        "today": {"day": now.strftime("%A"), "hours": _range(today_open, today_close)},
    }


TOOL_SCHEMA: dict = {
    "type": "function",
    "function": {
        "name": "get_library_hours",
        "description": "Get the LRC's current opening hours: the weekly schedule and whether it's open today.",
        "parameters": {"type": "object", "properties": {}},
    },
}
