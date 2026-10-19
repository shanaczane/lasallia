"""Chatbot tool: the most recently added books.

search_catalog ranks by topic, and "new" isn't a topic, so this sorts by
when each book was added.
"""

from datetime import datetime, timedelta, timezone

from core.supabase import get_admin_client
from routers.books import _apply_real_availability, _redact_for_patrons
from schemas.book import Book

DEFAULT_LIMIT = 8
MAX_LIMIT = 20


def get_new_arrivals(limit: int = DEFAULT_LIMIT, days: int | None = None) -> list[Book]:
    """Newest titles first. `days` limits to books added in that window,
    so "anything new this week?" can honestly return nothing."""
    admin = get_admin_client()
    limit = max(1, min(int(limit or DEFAULT_LIMIT), MAX_LIMIT))

    query = (
        admin.table("books")
        .select("*")
        .is_("archived_at", "null")
        .order("created_at", desc=True)
        .limit(limit)
    )
    if days:
        since = datetime.now(timezone.utc) - timedelta(days=int(days))
        query = query.gte("created_at", since.isoformat())
    books = query.execute().data
    if not books:
        return []

    copies = (
        admin.table("book_copies").select("book_id, status")
        .in_("book_id", [b["id"] for b in books]).execute().data
    )
    books = _apply_real_availability(books, copies)
    books = _redact_for_patrons(books, None)
    return [Book(**b) for b in books]


TOOL_SCHEMA: dict = {
    "type": "function",
    "function": {
        "name": "get_new_arrivals",
        "description": (
            "List the books most recently added to the DLSL Learning Resource Center catalog, newest first. "
            "Use for any question about new, newly added, recently added, or latest books or arrivals."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "days": {
                    "type": "integer",
                    "description": "Only include books added within this many days (e.g. 7 for 'this week', 30 for 'this month'). Omit when no time frame was asked for.",
                },
                "limit": {
                    "type": "integer",
                    "description": f"How many books to return (default {DEFAULT_LIMIT}, max {MAX_LIMIT}).",
                },
            },
            "required": [],
        },
    },
}
