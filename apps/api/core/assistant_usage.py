"""Counting library assistant use (migrations/0061_assistant_usage.sql).

One row per answered question: when, where (kiosk or web), what kind of
user (guest, student, faculty or staff) and whether the rule-based path or
the AI answered. Never the message, the user's id or name. A failed insert
is logged and ignored, so counting can never break the chat.
"""

import logging
from typing import Literal

from supabase import Client

from schemas.auth import UserProfile

logger = logging.getLogger(__name__)

AnsweredBy = Literal["rule", "ai"]
_USER_TYPES = {"student": "student", "faculty": "faculty", "librarian": "staff"}


def user_type(user: UserProfile | None) -> str:
    """'guest' when nobody is signed in (or a guest account), else the role,
    with librarians counted as 'staff'."""
    if user is None:
        return "guest"
    return _USER_TYPES.get(user.role, "guest")


def record_question(
    admin: Client, session_id: str, surface: str, user: UserProfile | None, answered_by: AnsweredBy
) -> None:
    try:
        admin.table("assistant_usage").insert({
            "surface": surface,
            "user_type": user_type(user),
            "answered_by": answered_by,
            "session_key": session_id,
        }).execute()
    except Exception:
        logger.exception("Could not record assistant usage")
