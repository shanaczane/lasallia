# Library settings (info, borrowing rules, hours). Librarians only, except
# the public endpoint.

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from core.audit import changed_fields, log_action
from core.deps import require_librarian, require_librarian_profile
from core.settings import get_library_settings
from core.supabase import get_admin_client
from schemas.auth import UserProfile
from schemas.settings import (
    CloseDateRequest,
    LibraryCalendarDate,
    LibrarySettings,
    PublicLibrarySettings,
    UpdateLibrarySettingsRequest,
)

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=LibrarySettings)
def get_settings(librarian: UserProfile = Depends(require_librarian)):
    return get_library_settings(get_admin_client())


# No login needed (the login page uses it). Only returns fields that are
# safe to show the public.
@router.get("/public", response_model=PublicLibrarySettings)
def get_public_settings():
    return get_library_settings(get_admin_client())


# Closed dates and holidays. A date with no row follows the weekly hours.
@router.get("/calendar", response_model=list[LibraryCalendarDate])
def list_closed_dates(librarian: UserProfile = Depends(require_librarian)):
    return (
        get_admin_client().table("library_calendar").select("date, note")
        .eq("is_school_day", False).order("date").execute()
    ).data


@router.put("/calendar/{day}", response_model=LibraryCalendarDate)
def close_date(
    day: date,
    body: CloseDateRequest,
    librarian: UserProfile = Depends(require_librarian_profile),
):
    admin = get_admin_client()
    note = (body.note or "").strip() or None
    row = {"date": day.isoformat(), "is_school_day": False, "note": note}
    admin.table("library_calendar").upsert(row, on_conflict="date").execute()
    log_action(admin, librarian, "calendar.close_date", "library_calendar", day.isoformat(), {"note": note})
    return row


@router.delete("/calendar/{day}", status_code=status.HTTP_204_NO_CONTENT)
def reopen_date(day: date, librarian: UserProfile = Depends(require_librarian_profile)):
    admin = get_admin_client()
    res = admin.table("library_calendar").delete().eq("date", day.isoformat()).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That date isn't marked closed")
    log_action(admin, librarian, "calendar.reopen_date", "library_calendar", day.isoformat())


@router.patch("", response_model=LibrarySettings)
def update_settings(
    body: UpdateLibrarySettingsRequest,
    librarian: UserProfile = Depends(require_librarian_profile),
):
    changes = body.model_dump(exclude_unset=True)
    for key in ("report_prepared_by_title", "report_noted_by_title", "report_approved_by_title"):
        if key in changes:
            if changes[key] is None or not changes[key].strip():
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Signature job titles can't be blank")
            changes[key] = changes[key].strip()
    if not changes:
        return get_library_settings(get_admin_client())

    admin = get_admin_client()
    before = get_library_settings(admin)
    _check_timers({**before, **changes})
    audited = changed_fields(before, changes)
    changes["updated_at"] = datetime.now(timezone.utc).isoformat()
    changes["updated_by"] = librarian.id

    # Upsert so saving works even if the settings row doesn't exist yet.
    try:
        res = admin.table("library_settings").upsert({"id": 1, **changes}).execute()
    except Exception as e:
        # PGRST204/205: a column or table is missing, usually because a
        # migration wasn't applied. Say so clearly instead of a bare 500.
        message = str(e)
        if "PGRST204" in message or "PGRST205" in message or "schema cache" in message:
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "Settings can't be saved yet — a database migration hasn't been applied "
                "(migrations/0024_library_settings.sql, 0025_library_operating_hours.sql, "
                "0057_kiosk_borrow_security.sql, 0058_desk_id_tap.sql, 0060_report_signatures.sql, "
                "0061_librarian_profiles.sql, 0068_book_request_review.sql and 0069_reserve_loan_period.sql). "
                "Ask whoever manages the database to run it, then try again.",
            )
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not save settings")

    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not save settings")
    log_action(admin, librarian, "settings.update", "library_settings", "1", {"changed": audited})
    # Re-read so numbers are converted the same way as everywhere else.
    return get_library_settings(admin)


def _check_timers(cfg: dict) -> None:
    """The kiosk and hold timers have to fit inside each other."""
    if cfg["kiosk_idle_warning_seconds"] >= cfg["kiosk_idle_timeout_seconds"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The session warning must start before the session ends")
    if cfg["hold_extend_window_seconds"] >= cfg["hold_duration_seconds"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The \"Add time\" window must be shorter than the hold")
    if cfg["hold_max_seconds"] < cfg["hold_duration_seconds"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The longest hold can't be shorter than the hold itself")
