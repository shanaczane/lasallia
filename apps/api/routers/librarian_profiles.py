# Librarian profiles under the shared login. The picker's endpoints only
# need the shared login, since no profile is active yet; managing profiles
# needs an active one.

import math
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError

from core.deps import require_librarian, require_librarian_profile
from core.librarian_profiles import LOCK_SECONDS, MAX_FAILED_ATTEMPTS, hash_pin, issue_token, pin_matches
from core.settings import get_library_settings
from core.supabase import get_admin_client
from schemas.auth import ActiveLibrarian, UserProfile
from schemas.librarian_profile import (
    ActiveProfileSession,
    CreateProfileRequest,
    LinkCardRequest,
    ManagedProfile,
    ProfileOption,
    ResetPinRequest,
    SignInRequest,
    UpdateProfileRequest,
)

router = APIRouter(prefix="/librarian-profiles", tags=["librarian-profiles"])

# staff_rfid_uid is only read to report whether a card is linked.
_MANAGED_COLUMNS = "id, full_name, is_active, staff_rfid_uid, locked_until, created_at"


def _locked_seconds(locked_until: str | None) -> int:
    if not locked_until:
        return 0
    left = (datetime.fromisoformat(locked_until) - datetime.now(timezone.utc)).total_seconds()
    return max(math.ceil(left), 0)


def _lock_message(seconds: int) -> str:
    minutes = max(math.ceil(seconds / 60), 1)
    return f"This profile is locked. Try again in {minutes} minute{'s' if minutes != 1 else ''}."


def _managed(row: dict) -> ManagedProfile:
    return ManagedProfile(
        id=row["id"],
        full_name=row["full_name"],
        is_active=row["is_active"],
        has_staff_card=bool(row.get("staff_rfid_uid")),
        locked_until=row.get("locked_until") if _locked_seconds(row.get("locked_until")) else None,
        created_at=row["created_at"],
    )


def _load(admin, profile_id: str, columns: str = _MANAGED_COLUMNS) -> dict:
    res = admin.table("librarian_profiles").select(columns).eq("id", profile_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Librarian profile not found")
    return res.data[0]


def _check_name_free(admin, full_name: str, exclude_id: str | None = None) -> None:
    rows = admin.table("librarian_profiles").select("id").ilike("full_name", full_name).execute().data
    if any(r["id"] != exclude_id for r in rows):
        raise HTTPException(status.HTTP_409_CONFLICT, "There's already a librarian profile with this name")


def _session(admin, profile: dict, account_id: str) -> ActiveProfileSession:
    idle_minutes = get_library_settings(admin)["librarian_idle_timeout_minutes"]
    token, expires_at = issue_token(profile, account_id, idle_minutes)
    return ActiveProfileSession(
        token=token,
        expires_at=expires_at,
        profile_id=profile["id"],
        full_name=profile["full_name"],
        idle_timeout_minutes=idle_minutes,
    )


# ── The "Who is using Lasallia?" screen ──

@router.get("/active", response_model=list[ProfileOption])
def list_active_profiles(librarian: UserProfile = Depends(require_librarian)):
    rows = (
        get_admin_client().table("librarian_profiles")
        .select("id, full_name, locked_until").eq("is_active", True).order("full_name").execute()
    ).data
    return [
        ProfileOption(id=r["id"], full_name=r["full_name"], locked_seconds=_locked_seconds(r.get("locked_until")))
        for r in rows
    ]


@router.post("/{profile_id}/sign-in", response_model=ActiveProfileSession)
def sign_in(profile_id: str, body: SignInRequest, librarian: UserProfile = Depends(require_librarian)):
    uid = (body.rfid_uid or "").strip()
    if bool(body.pin) == bool(uid):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enter your PIN or tap your staff ID")

    admin = get_admin_client()
    profile = _load(admin, profile_id, "id, full_name, pin_hash, staff_rfid_uid, is_active, locked_until")
    if not profile["is_active"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This librarian profile has been disabled")

    # Before the PIN check, so a lock can't be used to keep guessing.
    locked_for = _locked_seconds(profile.get("locked_until"))
    if locked_for:
        raise HTTPException(status.HTTP_423_LOCKED, _lock_message(locked_for))

    if body.pin:
        matched = pin_matches(body.pin, profile["pin_hash"])
    else:
        card = profile.get("staff_rfid_uid")
        matched = bool(card) and secrets.compare_digest(uid.encode(), card.encode())

    if not matched:
        failure = admin.rpc("record_librarian_sign_in_failure", {
            "p_profile_id": profile_id,
            "p_max_attempts": MAX_FAILED_ATTEMPTS,
            "p_lock_seconds": LOCK_SECONDS,
        }).execute().data
        locked_for = _locked_seconds(failure.get("locked_until"))
        if locked_for:
            raise HTTPException(status.HTTP_423_LOCKED, _lock_message(locked_for))
        left = MAX_FAILED_ATTEMPTS - failure["failed_attempts"]
        what = "PIN" if body.pin else "staff ID"
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            f"That {what} doesn't match this profile. {left} attempt{'s' if left != 1 else ''} left before it locks.",
        )

    admin.table("librarian_profiles").update({"failed_attempts": 0, "locked_until": None}).eq("id", profile_id).execute()
    return _session(admin, profile, librarian.id)


# The browser calls this while the librarian is active. An idle token simply
# runs out.
@router.post("/session/renew", response_model=ActiveProfileSession)
def renew_session(librarian: ActiveLibrarian = Depends(require_librarian_profile)):
    profile = {"id": librarian.librarian_profile_id, "full_name": librarian.librarian_name}
    return _session(get_admin_client(), profile, librarian.id)


# ── Manage Librarians ──

@router.get("", response_model=list[ManagedProfile])
def list_profiles(librarian: ActiveLibrarian = Depends(require_librarian_profile)):
    rows = get_admin_client().table("librarian_profiles").select(_MANAGED_COLUMNS).order("full_name").execute().data
    return [_managed(r) for r in rows]


@router.post("", response_model=ManagedProfile, status_code=status.HTTP_201_CREATED)
def create_profile(body: CreateProfileRequest, librarian: ActiveLibrarian = Depends(require_librarian_profile)):
    admin = get_admin_client()
    full_name = body.full_name.strip()
    if not full_name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enter the librarian's name")
    _check_name_free(admin, full_name)
    row = admin.table("librarian_profiles").insert({"full_name": full_name, "pin_hash": hash_pin(body.pin)}).execute().data[0]
    return _managed(_load(admin, row["id"]))


@router.patch("/{profile_id}", response_model=ManagedProfile)
def update_profile(
    profile_id: str,
    body: UpdateProfileRequest,
    librarian: ActiveLibrarian = Depends(require_librarian_profile),
):
    admin = get_admin_client()
    _load(admin, profile_id)
    changes = body.model_dump(exclude_unset=True, exclude_none=True)

    if "full_name" in changes:
        changes["full_name"] = changes["full_name"].strip()
        if not changes["full_name"]:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enter the librarian's name")
        _check_name_free(admin, changes["full_name"], exclude_id=profile_id)

    # This also protects the last active profile: whoever disables someone
    # else is active themselves, so one always remains.
    if changes.get("is_active") is False and profile_id == librarian.librarian_profile_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't disable your own profile")

    if changes:
        admin.table("librarian_profiles").update(changes).eq("id", profile_id).execute()
    return _managed(_load(admin, profile_id))


# Also clears any lock, since the librarian now has a PIN they know.
@router.post("/{profile_id}/reset-pin", status_code=status.HTTP_204_NO_CONTENT)
def reset_pin(
    profile_id: str,
    body: ResetPinRequest,
    librarian: ActiveLibrarian = Depends(require_librarian_profile),
):
    admin = get_admin_client()
    _load(admin, profile_id)
    admin.table("librarian_profiles").update({
        "pin_hash": hash_pin(body.pin),
        "failed_attempts": 0,
        "locked_until": None,
    }).eq("id", profile_id).execute()


@router.put("/{profile_id}/staff-card", response_model=ManagedProfile)
def link_staff_card(
    profile_id: str,
    body: LinkCardRequest,
    librarian: ActiveLibrarian = Depends(require_librarian_profile),
):
    admin = get_admin_client()
    _load(admin, profile_id)
    uid = body.rfid_uid.strip()
    if not uid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tap the staff ID on the reader")

    in_use = admin.table("librarian_profiles").select("id").eq("staff_rfid_uid", uid).execute().data
    if any(r["id"] != profile_id for r in in_use):
        raise HTTPException(status.HTTP_409_CONFLICT, "This staff ID is already linked to another librarian")
    try:
        admin.table("librarian_profiles").update({"staff_rfid_uid": uid}).eq("id", profile_id).execute()
    except APIError as e:
        if e.code == "23505":
            raise HTTPException(status.HTTP_409_CONFLICT, "This staff ID is already linked to another librarian")
        raise
    return _managed(_load(admin, profile_id))


@router.delete("/{profile_id}/staff-card", response_model=ManagedProfile)
def unlink_staff_card(profile_id: str, librarian: ActiveLibrarian = Depends(require_librarian_profile)):
    admin = get_admin_client()
    _load(admin, profile_id)
    admin.table("librarian_profiles").update({"staff_rfid_uid": None}).eq("id", profile_id).execute()
    return _managed(_load(admin, profile_id))
