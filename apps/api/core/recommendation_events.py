# apps/api/core/recommendation_events.py
# Recommendations plan, Phase 9 — click-through logging for the "For
# You" section (and, later, whatever guest surface eventually renders
# /recommendations/popular — the write path is guest-ready even though
# nothing renders that surface yet).

from supabase import Client


def log_events(admin: Client, events: list[dict]) -> None:
    """One batched insert per call — the plan's "batch impressions, one
    insert per section render, not one per card." Each dict is a row:
    student_id, session_id, is_guest, book_id, event_type, rank."""
    if not events:
        return
    admin.table("recommendation_events").insert(events).execute()
