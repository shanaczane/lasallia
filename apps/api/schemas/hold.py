from pydantic import BaseModel

from schemas.book import Book

class ClaimHoldRequest(BaseModel):
    book_id: str
    station_session_id: str

# Count down from seconds_left (server clock), not expires_at, in case the
# device's clock is wrong.
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
    book: Book  # accession_no is always hidden here
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
