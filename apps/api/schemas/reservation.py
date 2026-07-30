from typing import Literal

from pydantic import BaseModel

from schemas.auth import UserProfile
from schemas.book import Book

ReservationStatus = Literal["pending", "confirmed", "ready", "cancelled"]

class Reservation(BaseModel):
    id: str
    user_id: str
    book_id: str
    requested_at: str
    confirmed_at: str | None = None
    cancelled_at: str | None = None
    pickup_by: str | None = None
    status: ReservationStatus
    notes: str | None = None
    books: Book | None = None       # embedded via the books FK, when selected
    profiles: UserProfile | None = None  # embedded via the user_id FK — the requesting patron

class CreateReservationRequest(BaseModel):
    book_id: str

class UpdateReservationRequest(BaseModel):
    status: ReservationStatus
