"""Chatbot tool: the full catalog record for one book.

Returns only what's in the record. If there's no description, the model
must say so rather than describe the book from its own knowledge.
"""

from pydantic import BaseModel

from core.supabase import get_admin_client
from routers.books import _apply_real_availability, _redact_for_patrons
from schemas.book import Book


class BookDetailsResult(BaseModel):
    book: Book
    # Not on the Book schema, so passed separately for the model.
    collection_type: str
    # Books shelved next to it (similar topic). Only filled when the book
    # has no description.
    nearby_by_call_number: list[dict] | None = None
    # Similar books that are available now. Only filled when this book
    # isn't available, so the model can suggest an alternative.
    similar_available_books: list[Book] | None = None


def _find_nearby_by_call_number(admin, book_id: str, limit: int = 3) -> list[dict]:
    rows = admin.table("books").select("id, title, call_number").is_("archived_at", "null").order("call_number").execute().data
    idx = next((i for i, r in enumerate(rows) if r["id"] == book_id), None)
    if idx is None:
        return []
    neighbors = rows[max(0, idx - limit):idx] + rows[idx + 1:idx + 1 + limit]
    return [{"title": r["title"], "call_number": r["call_number"]} for r in neighbors]


def _find_similar_available(admin, book_id: str, limit: int = 3) -> list[Book]:
    """Most similar books that are available right now. Fetches extra
    because some get filtered out."""
    neighbor_rows = (
        admin.table("book_similarities")
        .select("neighbor_book_id, rank")
        .eq("book_id", book_id)
        .order("rank")
        .limit(limit * 4)
        .execute()
    ).data
    if not neighbor_rows:
        return []

    neighbor_ids = [r["neighbor_book_id"] for r in neighbor_rows]
    books = admin.table("books").select("*").in_("id", neighbor_ids).is_("archived_at", "null").execute().data
    copies = admin.table("book_copies").select("book_id, status").in_("book_id", neighbor_ids).execute().data
    books = _apply_real_availability(books, copies)
    books = _redact_for_patrons(books, None)
    available_by_id = {b["id"]: b for b in books if b["status"] == "available"}

    ordered = [available_by_id[nid] for nid in neighbor_ids if nid in available_by_id]
    return [Book(**b) for b in ordered[:limit]]


def get_book_details(book_id: str) -> BookDetailsResult:
    """Full record: description, subjects, edition, year, publisher,
    collection type, call number and availability."""
    admin = get_admin_client()

    res = admin.table("books").select("*").eq("id", book_id).execute()
    if not res.data:
        raise ValueError(f"No book found with id {book_id}")
    raw = res.data[0]
    # Archived books are hidden from the chatbot for everyone.
    if raw.get("archived_at"):
        raise ValueError(f"No book found with id {book_id}")

    copies_res = admin.table("book_copies").select("book_id, status").eq("book_id", book_id).execute().data
    enriched = _apply_real_availability([dict(raw)], copies_res)[0]
    enriched = _redact_for_patrons([enriched], None)[0]
    book = Book(**enriched)

    nearby = _find_nearby_by_call_number(admin, book_id) if not book.abstract else None
    similar_available = _find_similar_available(admin, book_id) if book.status != "available" else None

    return BookDetailsResult(
        book=book,
        collection_type=raw.get("collection_type") or "General",
        nearby_by_call_number=nearby,
        similar_available_books=similar_available,
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
