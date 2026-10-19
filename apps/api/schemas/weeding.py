# Weeding candidates and the archive/restore/dismiss log.

from pydantic import BaseModel


class WeedingCandidate(BaseModel):
    book_id: str
    title: str
    author: str
    category: str
    published_year: int | None = None
    borrow_count_in_window: int
    years_since_added: float
    # The plain rule-based reason; never depends on AI.
    heuristic_reason: str
    # AI-reworded reason, or heuristic_reason if AI isn't available.
    reason: str


class WeedingEvent(BaseModel):
    id: str
    book_id: str
    book_title: str | None = None
    event_type: str
    reason: str | None = None
    performed_by: str | None = None
    performed_by_name: str | None = None
    occurred_at: str
