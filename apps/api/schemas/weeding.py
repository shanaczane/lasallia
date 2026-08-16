# apps/api/schemas/weeding.py
# Reports plan, Phase 2 — weeding candidates + the archive/restore/
# dismiss event log ("Weeding logs").

from pydantic import BaseModel


class WeedingCandidate(BaseModel):
    book_id: str
    title: str
    author: str
    category: str
    published_year: int | None = None
    borrow_count_in_window: int
    years_since_added: float
    # Heuristic-derived, always true regardless of whether AI narration
    # succeeded — the fact the candidate was flagged never depends on AI.
    heuristic_reason: str
    # AI-narrated version of heuristic_reason, when OPENAI_API_KEY is
    # configured and the call succeeds; falls back to heuristic_reason
    # otherwise so the report still works with zero AI involvement.
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
