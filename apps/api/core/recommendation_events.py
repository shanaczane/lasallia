# Logs impressions and clicks on recommended books (guests included).

from supabase import Client


def log_events(admin: Client, events: list[dict]) -> None:
    """Inserts all events in one call. Each dict is a row: student_id,
    session_id, is_guest, book_id, event_type, rank."""
    if not events:
        return
    admin.table("recommendation_events").insert(events).execute()
