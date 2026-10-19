from typing import Literal

from pydantic import BaseModel

from schemas.book import Book


class RecommendationItem(BaseModel):
    book: Book
    rank: int
    score: float
    reason: str
    # None for program/popular picks, which aren't tied to one of the
    # student's books.
    reason_book_id: str | None = None


class RecommendationsResponse(BaseModel):
    recommendations: list[RecommendationItem]
    # None when there are no stored recommendations at all.
    generated_at: str | None = None
    # Which list this came from, so the frontend can pick the subtitle.
    rung: Literal["personal", "program", "popular"] = "personal"


# Impression and click logging.
class RecommendationEvent(BaseModel):
    event_type: Literal["impression", "click", "reserve", "dismiss"]
    book_id: str
    rank: int | None = None


class LogEventsRequest(BaseModel):
    events: list[RecommendationEvent]
    # Random id from the browser, for guests only. Ignored when logged in.
    session_id: str | None = None
