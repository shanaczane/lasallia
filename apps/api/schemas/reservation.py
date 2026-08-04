from typing import Literal

from pydantic import BaseModel

from schemas.auth import UserProfile
from schemas.book import Book
from schemas.loan import Condition

ReservationStatus = Literal["pending", "ready", "fulfilled", "cancelled", "expired"]

class Reservation(BaseModel):
    id: str
    user_id: str
    book_id: str
    book_copy_id: str | None = None
    requested_at: str
    confirmed_at: str | None = None
    cancelled_at: str | None = None
    fulfilled_at: str | None = None
    pickup_by: str | None = None
    status: ReservationStatus
    notes: str | None = None
    queue_position: int | None = None  # computed on read, only meaningful while 'pending'
    books: Book | None = None       # embedded via the books FK, when selected
    profiles: UserProfile | None = None  # embedded via the user_id FK — the requesting patron

class CreateReservationRequest(BaseModel):
    book_id: str

class UpdateReservationRequest(BaseModel):
    status: Literal["cancelled"]

class PickupReservationRequest(BaseModel):
    accession_number: str
    condition: Condition
    purpose: str | None = None
    notes: str | None = None
