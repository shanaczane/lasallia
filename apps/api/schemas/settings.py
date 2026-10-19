# Library settings: info, borrowing rules and opening hours. Read through
# core/settings.py.

from pydantic import BaseModel


class LibrarySettings(BaseModel):
    library_name: str
    address: str
    contact_email: str
    contact_number: str

    max_books_per_borrower: int
    standard_loan_period_days: int
    max_renewals: int
    renewal_period_days: int
    fine_per_day: float
    max_fine_per_book: float
    reservation_hold_period_days: int
    max_active_reservations: int

    # "HH:MM" or "HH:MM:SS". Both empty means closed (no fines that day).
    weekday_open_time: str | None = None
    weekday_close_time: str | None = None
    saturday_open_time: str | None = None
    saturday_close_time: str | None = None
    sunday_open_time: str | None = None
    sunday_close_time: str | None = None

    # None only when using the built-in defaults.
    updated_at: str | None = None
    updated_by: str | None = None
    # True when the settings table is missing and defaults are used, so the
    # page can explain why saving will fail.
    is_default: bool = False


# The settings that are safe to show before login (no borrowing rules, no
# librarian ids).
class PublicLibrarySettings(BaseModel):
    library_name: str
    address: str
    contact_email: str
    contact_number: str

    weekday_open_time: str | None = None
    weekday_close_time: str | None = None
    saturday_open_time: str | None = None
    saturday_close_time: str | None = None
    sunday_open_time: str | None = None
    sunday_close_time: str | None = None


# Only the fields sent are saved.
class UpdateLibrarySettingsRequest(BaseModel):
    library_name: str | None = None
    address: str | None = None
    contact_email: str | None = None
    contact_number: str | None = None

    max_books_per_borrower: int | None = None
    standard_loan_period_days: int | None = None
    max_renewals: int | None = None
    renewal_period_days: int | None = None
    fine_per_day: float | None = None
    max_fine_per_book: float | None = None
    reservation_hold_period_days: int | None = None
    max_active_reservations: int | None = None

    weekday_open_time: str | None = None
    weekday_close_time: str | None = None
    # Send null to mark the day closed (leaving it out means no change).
    saturday_open_time: str | None = None
    saturday_close_time: str | None = None
    sunday_open_time: str | None = None
    sunday_close_time: str | None = None
