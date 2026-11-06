# Library settings: info, borrowing rules and opening hours. Read through
# core/settings.py.

from pydantic import BaseModel, Field


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

    # Kiosk and borrowing timers, in seconds.
    kiosk_idle_timeout_seconds: int = 90
    kiosk_idle_warning_seconds: int = 15
    hold_duration_seconds: int = 180
    hold_extend_window_seconds: int = 45
    hold_max_seconds: int = 540
    kiosk_tap_confirm_seconds: int = 60
    # Fine payments and desk pickups need the borrower's own ID tap.
    require_id_tap_at_desk: bool = False

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

    # The kiosk reads its idle timer before anyone taps in.
    kiosk_idle_timeout_seconds: int = 90
    kiosk_idle_warning_seconds: int = 15


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

    kiosk_idle_timeout_seconds: int | None = Field(None, ge=30)
    kiosk_idle_warning_seconds: int | None = Field(None, ge=5)
    hold_duration_seconds: int | None = Field(None, ge=60)
    hold_extend_window_seconds: int | None = Field(None, ge=10)
    hold_max_seconds: int | None = Field(None, ge=60)
    kiosk_tap_confirm_seconds: int | None = Field(None, ge=15)
    require_id_tap_at_desk: bool | None = None

    weekday_open_time: str | None = None
    weekday_close_time: str | None = None
    # Send null to mark the day closed (leaving it out means no change).
    saturday_open_time: str | None = None
    saturday_close_time: str | None = None
    sunday_open_time: str | None = None
    sunday_close_time: str | None = None
