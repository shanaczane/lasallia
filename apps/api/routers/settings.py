# Library settings (info, borrowing rules, hours). Librarians only, except
# the public endpoint.

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from core.deps import require_librarian
from core.settings import get_library_settings
from core.supabase import get_admin_client
from schemas.auth import UserProfile
from schemas.settings import LibrarySettings, PublicLibrarySettings, UpdateLibrarySettingsRequest

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=LibrarySettings)
def get_settings(librarian: UserProfile = Depends(require_librarian)):
    return get_library_settings(get_admin_client())


# No login needed (the login page uses it). Only returns fields that are
# safe to show the public.
@router.get("/public", response_model=PublicLibrarySettings)
def get_public_settings():
    return get_library_settings(get_admin_client())


@router.patch("", response_model=LibrarySettings)
def update_settings(
    body: UpdateLibrarySettingsRequest,
    librarian: UserProfile = Depends(require_librarian),
):
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        return get_library_settings(get_admin_client())

    admin = get_admin_client()
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
                "(migrations/0024_library_settings.sql and 0025_library_operating_hours.sql). "
                "Ask whoever manages the database to run it, then try again.",
            )
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not save settings")

    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not save settings")
    # Re-read so numbers are converted the same way as everywhere else.
    return get_library_settings(admin)
