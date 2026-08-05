from typing import Literal

from pydantic import BaseModel

from schemas.book import Book

VisitorType = Literal["nocei", "non_nocei"]
InHouseLoanStatus = Literal["active", "returned"]
Purpose = Literal["library_use", "photocopy"]

class InHouseLoan(BaseModel):
    id: str
    book_copy_id: str
    accession_number: str | None = None
    librarian_id: str
    guest_name: str
    guest_id_number: str
    visitor_type: VisitorType
    fee_paid: bool
    purpose: Purpose
    checked_out_at: str
    returned_at: str | None = None
    status: InHouseLoanStatus
    notes: str | None = None
    books: Book | None = None

class CreateInHouseLoanRequest(BaseModel):
    accession_number: str
    guest_name: str
    guest_id_number: str
    visitor_type: VisitorType
    fee_paid: bool = False
    purpose: Purpose
    notes: str | None = None
