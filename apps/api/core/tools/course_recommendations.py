"""Chatbot — the recommend_for_my_course tool.

Wraps core/recommendations.py's get_program_recommendations (the same
logic behind the "For You" dashboard's program rung) instead of leaving
the model to guess a search_catalog query from a bare program code. Book
shaping (real availability, accession redaction) reuses
core/tools/catalog.py's exact pattern via routers/books.py's helpers.
"""

from pydantic import BaseModel

from core.recommendations import get_program_recommendations
from core.supabase import get_admin_client
from routers.books import _apply_real_availability, _redact_accession
from schemas.auth import UserProfile
from schemas.book import Book

DEFAULT_LIMIT = 5


class ProgramRecommendationResult(BaseModel):
    book: Book
    reason: str


def recommend_for_my_course(user: UserProfile, limit: int = DEFAULT_LIMIT) -> list[ProgramRecommendationResult]:
    """Tool handler for `recommend_for_my_course`. Only ever registered
    (core/tools/registry.py) for a logged-in caller with a program on
    file — no model-suppliable program argument, same "identity never
    comes from the model" rule as core/tools/account.py."""
    if not user.program:
        return []

    admin = get_admin_client()
    recs = get_program_recommendations(admin, user.program, limit)
    if not recs:
        return []

    book_ids = [r.book_id for r in recs]
    books = admin.table("books").select("*").in_("id", book_ids).execute().data
    copies = admin.table("book_copies").select("book_id, status").in_("book_id", book_ids).execute().data
    books = _apply_real_availability(books, copies)
    books = _redact_accession(books, None)
    by_id = {b["id"]: b for b in books}

    return [
        ProgramRecommendationResult(book=Book(**by_id[r.book_id]), reason=r.reason)
        for r in recs
        if r.book_id in by_id
    ]


TOOL_SCHEMA: dict = {
    "type": "function",
    "function": {
        "name": "recommend_for_my_course",
        "description": "Recommend books for the student's own degree program/course, based on what other students in the same program actually borrow (falls back to the catalog's program-tagged titles if too few students have borrowed yet). No parameters — always resolves to whoever is logged in and their program on file.",
        "parameters": {"type": "object", "properties": {}},
    },
}
