# apps/api/schemas/settings.py
# The librarian Settings page's Library Info + Borrowing Rules tabs — one
# shared, persisted row (migrations/0024_library_settings.sql,
# 0025_library_operating_hours.sql). See core/settings.py for how the
# rest of the API actually reads this at request time — including
# core/calendar.py's fine math, which now checks these operating hours
# instead of assuming every day is open.

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

    # "HH:MM" (or "HH:MM:SS" — both parse fine downstream). All three
    # groups are nullable: null on both means closed that day (or, for
    # weekday, a full closure like a semester break) — no fine accrues.
    weekday_open_time: str | None = None
    weekday_close_time: str | None = None
    saturday_open_time: str | None = None
    saturday_close_time: str | None = None
    sunday_open_time: str | None = None
    sunday_close_time: str | None = None

    # None only in the pre-migration fallback (core/settings.py's
    # _DEFAULTS) — a row that's actually been saved always has this set.
    updated_at: str | None = None
    updated_by: str | None = None
    # Set only when GET is answered by the built-in fallback because the
    # migration hasn't been run against this database yet — lets the
    # Settings page tell the librarian why Save will fail, instead of a
    # generic 500 further down the line.
    is_default: bool = False


# All fields optional — PATCH only writes what's actually included, same
# convention as UpdatePatronStatusRequest.
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
    # Explicitly nullable in the request too (not just "omit to leave
    # unchanged") — marking Saturday/Sunday closed means setting these
    # to null, not leaving them out.
    saturday_open_time: str | None = None
    saturday_close_time: str | None = None
    sunday_open_time: str | None = None
    sunday_close_time: str | None = None
