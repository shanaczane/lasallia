from typing import Literal

from pydantic import BaseModel

from schemas.book import Book

LoanStatus = Literal["active", "returned", "overdue"]
Condition = Literal["good", "minor_wear", "already_damaged"]

# The librarian's condition check at return (fuller than the student's at borrow).
ReturnCondition = Literal["good", "fair", "damaged", "incomplete"]
FineStatus = Literal["none", "paid", "unsettled"]

class ConfirmLoanRequest(BaseModel):
    token: str
    accession_number: str
    condition: Condition
    purpose: str | None = None
    notes: str | None = None

# Checkout at the desk: the scanned accession number picks the exact copy.
class LibrarianAssistedLoanRequest(BaseModel):
    station_session_id: str
    accession_number: str
    condition: Condition
    purpose: str | None = None
    notes: str | None = None

class Borrower(BaseModel):
    full_name: str | None = None
    avatar_url: str | None = None

class Loan(BaseModel):
    id: str
    book_copy_id: str
    accession_number: str | None = None
    student_id: str
    station_session_id: str | None = None
    borrowed_at: str
    due_date: str
    returned_at: str | None = None
    status: LoanStatus
    condition_at_borrow: Condition
    purpose: str | None = None
    notes: str | None = None
    condition_at_return: ReturnCondition | None = None
    condition_notes: str | None = None
    fine_amount: float | None = None
    # The two parts of fine_amount. Empty on older loans.
    overdue_fine_amount: float | None = None
    damage_fine_amount: float | None = None
    fine_status: FineStatus | None = None
    receipt_number: str | None = None
    # The librarian, for desk checkouts. Empty for self-service loans.
    assisted_by: str | None = None
    books: Book | None = None
    profiles: Borrower | None = None
    # Only set on overdue loans: the fine so far. Returned loans use fine_amount.
    days_overdue: int | None = None
    preview_fine_amount: float | None = None
    # Only on the return response: whether the copy goes to reshelving (true)
    # or is held for a reservation (false).
    needs_reshelving: bool | None = None

# A loan found at the return desk, with the fine so far (not stored).
class LoanLookupResult(Loan):
    days_overdue: int
    preview_fine_amount: float

class ReturnLoanRequest(BaseModel):
    condition_at_return: ReturnCondition
    condition_notes: str | None = None
    # Only for new damage: the librarian's replacement cost estimate (a
    # processing fee is added on top).
    replacement_cost: float | None = None
    fine_settlement: Literal["paid", "unsettled"] | None = None
    receipt_number: str | None = None

class ReshelveRequest(BaseModel):
    accession_number: str

# PATCH /loans/{id}/settle-fine: an unpaid fine was paid later at the desk.
class SettleFineRequest(BaseModel):
    receipt_number: str

# A copy waiting to be reshelved (from a loan or in-house return).
class ReshelvingQueueItem(BaseModel):
    id: str  # book_copies.id
    accession_number: str | None = None
    books: Book | None = None
    # When it was last returned; None if it's never been on loan.
    returned_at: str | None = None

# A copy in the "Reshelved Today" list (only the latest scan per copy is kept).
class ReshelvedItem(BaseModel):
    id: str  # book_copies.id
    accession_number: str | None = None
    books: Book | None = None
    reshelved_at: str
