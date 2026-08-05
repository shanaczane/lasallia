from typing import Literal

from pydantic import BaseModel

from schemas.book import Book

LoanStatus = Literal["active", "returned", "overdue"]
Condition = Literal["good", "minor_wear", "already_damaged"]

# Return-time inspection uses a different, fuller vocabulary than the
# borrow-time self-declaration above — a real librarian inspection (water
# damage, torn pages, writing, etc.) vs. a student's own quick call.
ReturnCondition = Literal["good", "fair", "damaged", "incomplete"]
FineStatus = Literal["none", "paid", "unsettled"]

class ConfirmLoanRequest(BaseModel):
    token: str
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
    fine_status: FineStatus | None = None
    receipt_number: str | None = None
    books: Book | None = None
    profiles: Borrower | None = None
    # Populated by GET /loans only for status == "overdue" rows (the
    # librarian Reports overdue table needs a real fine preview, not a
    # frontend-side reimplementation of the school-day-calendar math).
    # None everywhere else — a returned loan's real fine lives in
    # fine_amount above, and an active loan has no fine yet.
    days_overdue: int | None = None
    preview_fine_amount: float | None = None

# GET /loans/lookup and /loans/search — the librarian's return-lookup
# screen (build plan 4.1/4.2). days_overdue/preview_fine_amount are
# computed at request time, never stored, so the librarian sees the fine
# before confirming anything.
class LoanLookupResult(Loan):
    days_overdue: int
    preview_fine_amount: float

class ReturnLoanRequest(BaseModel):
    condition_at_return: ReturnCondition
    condition_notes: str | None = None
    # Only meaningful when charging new damage (condition_at_borrow was
    # 'good' but condition_at_return isn't) — the librarian's estimate of
    # what the item costs to replace, per plan 4.4's "Replacement cost +
    # ₱50.00 processing fee".
    replacement_cost: float | None = None
    fine_settlement: Literal["paid", "unsettled"] | None = None
    receipt_number: str | None = None

class ReshelveRequest(BaseModel):
    accession_number: str
