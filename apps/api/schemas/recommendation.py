from pydantic import BaseModel

from schemas.book import Book


class RecommendationItem(BaseModel):
    book: Book
    rank: int
    score: float
    reason: str
    reason_book_id: str


class RecommendationsResponse(BaseModel):
    recommendations: list[RecommendationItem]
    # None when the student has no stored recommendations at all (no
    # borrow history yet, or the nightly job hasn't run since they
    # started borrowing) — the frontend's cold-start fallback (Phase 7)
    # keys off this being absent rather than an empty list alone, since
    # an empty list can also mean "had recommendations, all excluded live."
    generated_at: str | None = None
