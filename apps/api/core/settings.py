# Reads the library's settings (loan limits, fines, hours) from the single
# library_settings row. Not cached, so a rule change applies immediately.

from supabase import Client

# Used when the settings row or a column is missing. Must match the
# database column defaults.
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

    # Defaults fill in any column a newer migration added but this
    # database doesn't have yet.
    row = {**_DEFAULTS, **res.data[0]}
    # Numeric columns arrive as strings like '5.00'; convert them so the
    # math below works.
    for key in _INT_FIELDS:
        if row.get(key) is not None:
            row[key] = int(row[key])
    for key in _FLOAT_FIELDS:
        if row.get(key) is not None:
            row[key] = float(row[key])

    return {**row, "is_default": False}
