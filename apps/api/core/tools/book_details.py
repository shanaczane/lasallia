"""Chatbot Phase 3 — the get_book_details tool.

Returns the full catalog record for one title. When the description is
empty, the caller (the chat orchestration layer, using the system
prompt) must fall back to the honest "catalog has no description"
response (plan 3.3) — this function's job is only to return what's
actually in the record, never to fill gaps from model knowledge.
"""

from pydantic import BaseModel

from core.supabase import get_admin_client
from routers.books import _apply_real_availability, _redact_accession
from schemas.book import Book


class BookDetailsResult(BaseModel):
    book: Book
    # Book (schemas/book.py) doesn't carry collection_type — it's a
    # Phase-1-kiosk-plan field on the raw books row, not exposed to the
    # rest of the frontend's Book type. Kept here, separately, since
    # plan 3.1 explicitly wants it in the model's context.
    collection_type: str
    # Plan 3.3's optional-but-cheap fallback: physical neighbors are
    # topical neighbors under library classification. Only populated
    # when book.abstract is empty — no cost when there's a real
    # description to summarize instead.
    nearby_by_call_number: list[dict] | None = None


def _find_nearby_by_call_number(admin, book_id: str, limit: int = 3) -> list[dict]:
    rows = admin.table("books").select("id, title, call_number").order("call_number").execute().data
    idx = next((i for i, r in enumerate(rows) if r["id"] == book_id), None)
    if idx is None:
        return []
    neighbors = rows[max(0, idx - limit):idx] + rows[idx + 1:idx + 1 + limit]
    return [{"title": r["title"], "call_number": r["call_number"]} for r in neighbors]


def get_book_details(book_id: str) -> BookDetailsResult:
    """Tool handler for `get_book_details`. Full bibliographic record:
    description, subject headings, edition, year, publisher, collection
    type, call number, availability."""
    admin = get_admin_client()

    res = admin.table("books").select("*").eq("id", book_id).execute()
    if not res.data:
        raise ValueError(f"No book found with id {book_id}")
    raw = res.data[0]

    copies_res = admin.table("book_copies").select("book_id, status").eq("book_id", book_id).execute().data
    enriched = _apply_real_availability([dict(raw)], copies_res)[0]
    enriched = _redact_accession([enriched], None)[0]
    book = Book(**enriched)

    nearby = _find_nearby_by_call_number(admin, book_id) if not book.abstract else None

    return BookDetailsResult(
        book=book,
        collection_type=raw.get("collection_type") or "General",
        nearby_by_call_number=nearby,
    )


TOOL_SCHEMA: dict = {
    "type": "function",
    "function": {
        "name": "get_book_details",
        "description": "Get the full catalog record for one book by id, including its description, subject headings, and current availability.",
        "parameters": {
            "type": "object",
            "properties": {
                "book_id": {"type": "string", "description": "The book's catalog id, from a prior search_catalog result."},
            },
            "required": ["book_id"],
        },
    },
}
