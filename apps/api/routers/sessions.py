from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from supabase_auth.errors import AuthApiError

from core.deps import get_current_user
from core.supabase import get_admin_client, get_client
from schemas.auth import UserProfile
from schemas.session import OpenSessionRequest, StationSession

router = APIRouter(prefix="/station-sessions", tags=["station-sessions"])

def _insert_session(student_id: str, auth_method: str, station_id: str) -> dict:
    # service-role client: an rfid tap never produces a Supabase JWT, so
    # every auth_method writes this row the same way for consistency (see
    # the migration's note on why station_sessions has no RLS policies).
    admin = get_admin_client()
    res = admin.table("station_sessions").insert({
        "student_id": student_id,
        "auth_method": auth_method,
        "station_id": station_id,
    }).execute()
    if not res.data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not open session")
    session = res.data[0]

    # The kiosk greets whoever just tapped/logged in by first name — same
    # split-on-space pattern already used in holds.py's get_hold.
    profile_res = admin.table("profiles").select("full_name").eq("id", student_id).execute()
    full_name = (profile_res.data[0]["full_name"] if profile_res.data else None) or ""
    session["student_first_name"] = full_name.split(" ")[0] or "there"
    return session

# Not behind auth: this is what the kiosk calls to find out who's standing
# in front of it. manual_login's own password check IS the credential;
# rfid's UID lookup is the credential. Both converge on the same insert,
# so the resulting row is identical downstream except for auth_method.
@router.post("", response_model=StationSession, status_code=status.HTTP_201_CREATED)
def open_session(body: OpenSessionRequest):
    if body.auth_method == "manual_login":
        if not body.email or not body.password:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "email and password are required for manual_login")
        try:
            res = get_client().auth.sign_in_with_password({"email": body.email, "password": body.password})
        except AuthApiError as e:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e))
        student_id = res.user.id

    elif body.auth_method == "rfid":
        if not body.rfid_uid:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "rfid_uid is required for rfid")
        profile_res = get_admin_client().table("profiles").select("id").eq("rfid_uid", body.rfid_uid).execute()
        if not profile_res.data:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown RFID tag")
        student_id = profile_res.data[0]["id"]

    else:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unsupported auth_method")

    return _insert_session(student_id, body.auth_method, body.station_id)

# For the student web portal specifically — not a physical kiosk, so
# there's no reason to make an already-logged-in student retype their
# password. Their existing JWT is exactly as strong a credential as
# manual_login's password check, so this counts as auth_method
# "manual_login" too — same downstream shape either way.
@router.post("/from-token", response_model=StationSession, status_code=status.HTTP_201_CREATED)
def open_session_from_token(user: UserProfile = Depends(get_current_user)):
    return _insert_session(user.id, "manual_login", "web-portal")

# Phase 6 — closes a session (idle timeout, "Done/Log out", or a new tap
# interrupting this one). Not behind auth, same reasoning as open_session:
# an rfid-tapped session has no JWT to authenticate this call with, and
# the session id itself is not a meaningfully guessable/reusable secret.
# This is what makes claim_hold's existing `ended_at is not None` check
# (Phase 3) actually mean something, rather than a column nothing writes.
@router.post("/{session_id}/end", status_code=status.HTTP_204_NO_CONTENT)
def end_session(session_id: str):
    res = (
        get_admin_client()
        .table("station_sessions")
        .update({"ended_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", session_id)
        .is_("ended_at", "null")
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found or already ended")
