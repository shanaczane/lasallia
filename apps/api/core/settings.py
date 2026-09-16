# apps/api/core/settings.py
# Reads the one library_settings row (migrations/0024) that every
# borrowing-rule constant across routers/borrow.py, holds.py, loans.py,
# and reservations.py now defers to, instead of each hardcoding its own
# copy of the same number. Always a live read — no caching, no
# precompute — same reasoning core/weeding.py and core/reports.py give
# for not caching a librarian-triggered read: this is cheap (one row)
# and must never show a stale rule to a borrow that's happening right now.

from supabase import Client

# Matches the migration's own column defaults exactly, so a database that
# hasn't had 0024 applied yet still enforces the same real limits the
# code hardcoded before this table existed — "must degrade, never crash,"
# same as core/weeding.py's AI-narration fallback.
_DEFAULTS: dict[str, object] = {
    "library_name": "De La Salle Lipa — Learning Resource Center",
    "address": "Sen. Jose Diokno Building, 1962 J.P. Laurel National Highway, Lipa City, Batangas 4217",
    "contact_email": "learningresourcecenter@dlsl.edu.ph",
    "contact_number": "(043) 302-2900",
    "max_books_per_borrower": 3,
    "standard_loan_period_days": 7,
    "max_renewals": 2,
    "renewal_period_days": 7,
    "fine_per_day": 5.00,
    "max_fine_per_book": 100.00,
    "reservation_hold_period_days": 3,
    "max_active_reservations": 3,
    "weekday_open_time": "07:30",
    "weekday_close_time": "18:00",
    "saturday_open_time": "08:00",
    "saturday_close_time": "12:00",
    "sunday_open_time": None,
    "sunday_close_time": None,
    "updated_at": None,
    "updated_by": None,
}


_INT_FIELDS = (
    "max_books_per_borrower", "standard_loan_period_days", "max_renewals",
    "renewal_period_days", "reservation_hold_period_days", "max_active_reservations",
)
_FLOAT_FIELDS = ("fine_per_day", "max_fine_per_book")


def get_library_settings(admin: Client) -> dict:
    try:
        res = admin.table("library_settings").select("*").eq("id", 1).execute()
    except Exception:
        return {**_DEFAULTS, "is_default": True}
    if not res.data:
        return {**_DEFAULTS, "is_default": True}

    # _DEFAULTS underneath, not just around, the real row — a column a
    # later migration added (e.g. 0025's operating-hours fields) that
    # hasn't been applied to this database yet simply isn't a key in
    # res.data[0] at all; without this, LibrarySettings' required fields
    # would fail validation instead of degrading like everything else here.
    row = {**_DEFAULTS, **res.data[0]}
    # PostgREST serializes numeric(10,2) columns as JSON strings (to avoid
    # float-precision surprises on the wire), but every caller here does
    # real arithmetic with these values (fine math, timedelta(days=...))
    # — coerce explicitly rather than let a raw '5.00' silently turn a
    # multiplication into Python string-repeat or a timedelta TypeError.
    for key in _INT_FIELDS:
        if row.get(key) is not None:
            row[key] = int(row[key])
    for key in _FLOAT_FIELDS:
        if row.get(key) is not None:
            row[key] = float(row[key])

    return {**row, "is_default": False}
