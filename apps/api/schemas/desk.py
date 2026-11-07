# The desk's ID tap: who the borrower is and what they have out, owe or
# can pick up.

from pydantic import BaseModel

from schemas.loan import Loan, LoanLookupResult


class ReadyPickup(BaseModel):
    reservation_id: str
    book_id: str
    title: str
    author: str | None = None
    pickup_by: str | None = None


class IdentifyRequest(BaseModel):
    rfid_uid: str


class DeskPatron(BaseModel):
    id: str
    full_name: str | None = None
    avatar_url: str | None = None
    role: str | None = None
    program: str | None = None
    college: str | None = None
    year_level: int | None = None
    open_loans: list[LoanLookupResult] = []
    unpaid_fines: list[Loan] = []
    ready_pickups: list[ReadyPickup] = []
    # Library Settings: fine payments and pickups need this tap.
    require_id_tap: bool = False
