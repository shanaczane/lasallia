from typing import Literal

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
    can_extend: bool  # False once the hold has reached its longest allowed time
    book: Book  # accession_no is always hidden here
    student_first_name: str
    active_loan_count: int
    due_date_preview: str
    borrow_limit: int
    loan_period_days: int
    # How long "Add time" adds, and how close to the end it's offered.
    hold_duration_seconds: int
    extend_window_seconds: int
    # Kiosk borrows finish with a second ID tap at the kiosk.
    needs_kiosk_tap: bool
    # The phone has checked the number; waiting for that tap.
    awaiting_tap: bool

class BorrowEligibility(BaseModel):
    can_borrow: bool
    reason: str | None = None

class HoldExtendResponse(BaseModel):
    expires_at: str
    seconds_left: int
    can_extend: bool

# The phone's answers: the number on the book's label and its condition.
class VerifyHoldRequest(BaseModel):
    accession_number: str
    condition: Literal["good", "minor_wear", "already_damaged"]
    purpose: str | None = None
    notes: str | None = None

# Where a borrow is: waiting for the phone, waiting for the kiosk tap,
# borrowed, or gone (expired, cancelled or released).
class HoldStatus(BaseModel):
    status: Literal["waiting", "awaiting_tap", "borrowed", "gone"]
    seconds_left: int | None = None
    due_date: str | None = None

# The second ID tap at the kiosk.
class ConfirmTapRequest(BaseModel):
    station_session_id: str
    rfid_uid: str

# The kiosk has no login, so it proves it owns the hold with its session id.
class ReleaseHoldRequest(BaseModel):
    station_session_id: str | None = None
