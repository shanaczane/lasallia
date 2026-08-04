from typing import Literal

from pydantic import BaseModel

from schemas.book import Book

LoanStatus = Literal["active", "returned", "overdue"]
Condition = Literal["good", "minor_wear", "already_damaged"]

class ConfirmLoanRequest(BaseModel):
    token: str
    accession_number: str
    condition: Condition
    purpose: str | None = None
    notes: str | None = None

class Loan(BaseModel):
    id: str
    book_copy_id: str
    student_id: str
    station_session_id: str | None = None
    borrowed_at: str
    due_date: str
    returned_at: str | None = None
    status: LoanStatus
    condition_at_borrow: Condition
    purpose: str | None = None
    notes: str | None = None
    books: Book | None = None
