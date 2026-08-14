from typing import Literal

from pydantic import BaseModel

from schemas.book import Book


class RecommendationItem(BaseModel):
    book: Book
    rank: int
    score: float
    reason: str
    # None for rung 2-4 fallback items (Phase 7) — nothing a single book
    # the student engaged with, unlike a personal (rung 1) recommendation.
    reason_book_id: str | None = None


class RecommendationsResponse(BaseModel):
    recommendations: list[RecommendationItem]
    # None when the student has no stored recommendations at all (no
    # borrow history yet, or the nightly job hasn't run since they
    # started borrowing) — the frontend's cold-start fallback (Phase 7)
    # keys off this being absent rather than an empty list alone, since
    # an empty list can also mean "had recommendations, all excluded live."
    generated_at: str | None = None
    # Which rung of the Phase 7 fallback ladder actually produced this
    # response — lets the frontend pick the right section header/subtitle
    # without parsing `reason` strings. Always "popular" for
    # GET /recommendations/popular.
    rung: Literal["personal", "program", "popular"] = "personal"


# Phase 9 — click-through logging.
class RecommendationEvent(BaseModel):
    event_type: Literal["impression", "click", "reserve", "dismiss"]
    book_id: str
    rank: int | None = None


class LogEventsRequest(BaseModel):
    events: list[RecommendationEvent]
    # Opaque client-generated token, guest attribution only — ignored for
    # a logged-in caller, whose student_id comes from their session.
    session_id: str | None = None
