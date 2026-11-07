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
    reserve_loan_period_days: int = 7
    max_renewals: int
    renewal_period_days: int
    fine_per_day: float
    max_fine_per_book: float
    reservation_hold_period_days: int
    max_active_reservations: int
    max_copies_per_request: int = 10

    # Kiosk and borrowing timers, in seconds.
    kiosk_idle_timeout_seconds: int = 90
    kiosk_idle_warning_seconds: int = 15
    hold_duration_seconds: int = 180
    hold_extend_window_seconds: int = 45
    hold_max_seconds: int = 540
    kiosk_tap_confirm_seconds: int = 60
    # Fine payments and desk pickups need the borrower's own ID tap.
    require_id_tap_at_desk: bool = False
    # Back to the profile picker after this long with no activity.
    librarian_idle_timeout_minutes: int = 15

    # Job titles under the signature lines on exported reports. Placeholders
    # until the library confirms them.
    report_prepared_by_title: str = "Librarian"
    report_noted_by_title: str = "Head Librarian"
    report_approved_by_title: str = "Director, Learning Resource Center"

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
    # For the book request form's limit.
    max_copies_per_request: int = 10

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
class LibraryCalendarDate(BaseModel):
    date: str
    note: str | None = None


class CloseDateRequest(BaseModel):
    note: str | None = Field(None, max_length=200)


class UpdateLibrarySettingsRequest(BaseModel):
    library_name: str | None = None
    address: str | None = None
    contact_email: str | None = None
    contact_number: str | None = None

    max_books_per_borrower: int | None = None
    standard_loan_period_days: int | None = None
    reserve_loan_period_days: int | None = Field(None, ge=1)
    max_renewals: int | None = None
    renewal_period_days: int | None = None
    fine_per_day: float | None = None
    max_fine_per_book: float | None = None
    reservation_hold_period_days: int | None = None
    max_active_reservations: int | None = None
    max_copies_per_request: int | None = Field(None, ge=1)

    kiosk_idle_timeout_seconds: int | None = Field(None, ge=30)
    kiosk_idle_warning_seconds: int | None = Field(None, ge=5)
    hold_duration_seconds: int | None = Field(None, ge=60)
    hold_extend_window_seconds: int | None = Field(None, ge=10)
    hold_max_seconds: int | None = Field(None, ge=60)
    kiosk_tap_confirm_seconds: int | None = Field(None, ge=15)
    require_id_tap_at_desk: bool | None = None
    librarian_idle_timeout_minutes: int | None = Field(None, ge=5, le=120)

    report_prepared_by_title: str | None = Field(None, min_length=1, max_length=120)
    report_noted_by_title: str | None = Field(None, min_length=1, max_length=120)
    report_approved_by_title: str | None = Field(None, min_length=1, max_length=120)

    weekday_open_time: str | None = None
    weekday_close_time: str | None = None
    # Send null to mark the day closed (leaving it out means no change).
    saturday_open_time: str | None = None
    saturday_close_time: str | None = None
    sunday_open_time: str | None = None
    sunday_close_time: str | None = None
