from pydantic import BaseModel

from schemas.book import Book

class ClaimHoldRequest(BaseModel):
    book_id: str
    station_session_id: str

class ClaimHoldResponse(BaseModel):
    token: str
    expires_at: str
    qr_url: str

class HoldDetail(BaseModel):
    token: str
    expires_at: str
    book: Book  # accession_no always nulled — this is student-reachable, no exceptions
    student_first_name: str
    active_loan_count: int
    due_date_preview: str
