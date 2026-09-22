# apps/api/routers/settings.py
# Librarian Settings page — Library Info + Borrowing Rules tabs
# (migrations/0024_library_settings.sql). Librarian-only, same
# authorization boundary as routers/patrons.py: a collection-management
# setting, not a per-user preference.

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


# No auth — the login page's Contact Support / System Status links need
# this before anyone has signed in. PublicLibrarySettings drops every
# field that isn't meant for an anonymous visitor; pydantic ignores the
# extra keys in get_library_settings()'s dict rather than erroring on them.
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

    # upsert, not update — a database that hasn't had a row inserted yet
    # (migration ran, but the insert…on conflict seed didn't, or this is
    # a fresh environment) still gets Save to actually work rather than
    # silently touching zero rows.
    try:
        res = admin.table("library_settings").upsert({"id": 1, **changes}).execute()
    except Exception as e:
        # PGRST204/205 = PostgREST can't find a column/table it was asked
        # to write — almost always means a migration (0024, or 0025 for
        # the operating-hours columns) hasn't been applied to this
        # database yet. Surfaced specifically instead of a bare 500, since
        # get_library_settings() degrading gracefully on the GET side
        # means this is the *only* place a librarian would otherwise see
        # that anything's wrong.
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
    # Re-read through get_library_settings rather than trusting the
    # upsert's own response shape directly — same numeric-string coercion
    # every other reader gets, one code path for what a "row" means.
    return get_library_settings(admin)
