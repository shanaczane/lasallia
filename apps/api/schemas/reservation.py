from typing import Literal

from pydantic import BaseModel

from schemas.auth import UserProfile
from schemas.book import Book

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
    estimated_ready_at: str | None = None  # computed on read for a student's own 'pending' rows — an estimate only
    books: Book | None = None       # embedded via the books FK, when selected
    profiles: UserProfile | None = None  # embedded via the user_id FK — the requesting patron

class CreateReservationRequest(BaseModel):
    book_id: str

class ReservationEstimate(BaseModel):
    """What reserving this title would look like right now, shown to the
    student before they confirm."""
    queue_position: int
    estimated_ready_at: str | None = None  # None when no copy is expected back at all
    hold_period_days: int  # how long a ready copy waits on the hold shelf
    can_reserve: bool = True
    reason: str | None = None  # why not, when can_reserve is False — same message POST /reservations would give

class UpdateReservationRequest(BaseModel):
    status: Literal["cancelled"]
