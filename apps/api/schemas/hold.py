from pydantic import BaseModel

from schemas.book import Book

class ClaimHoldRequest(BaseModel):
    book_id: str
    station_session_id: str

# seconds_left is computed on the API's clock and is what clients should
# count down from — a device whose own clock is off would otherwise see
# every hold as already expired (or never expiring) from expires_at alone.
class ClaimHoldResponse(BaseModel):
    token: str
    expires_at: str
    seconds_left: int
    qr_url: str

class HoldDetail(BaseModel):
    token: str
    expires_at: str
    seconds_left: int
    can_extend: bool  # False once the hold has reached MAX_HOLD_SECONDS (routers/holds.py)
    book: Book  # accession_no always nulled — this is student-reachable, no exceptions
    student_first_name: str
    active_loan_count: int
    due_date_preview: str

class BorrowEligibility(BaseModel):
    can_borrow: bool
    reason: str | None = None

class HoldExtendResponse(BaseModel):
    expires_at: str
    seconds_left: int
    can_extend: bool
