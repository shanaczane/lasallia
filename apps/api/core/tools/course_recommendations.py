"""Chatbot tool: recommend books for the student's own program.

Uses the same program recommendations as the dashboard's "For You".
"""

from pydantic import BaseModel

from core.recommendations import get_program_recommendations
from core.supabase import get_admin_client
from routers.books import _apply_real_availability, _redact_for_patrons
from schemas.auth import UserProfile
from schemas.book import Book

DEFAULT_LIMIT = 5


class ProgramRecommendationResult(BaseModel):
    book: Book
    reason: str


def recommend_for_my_course(user: UserProfile, limit: int = DEFAULT_LIMIT) -> list[ProgramRecommendationResult]:
    """Only offered to logged-in users with a program on file. The program
    comes from the user's profile, never from the model."""
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
    books = _redact_for_patrons(books, None)
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
