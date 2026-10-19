from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from supabase_auth.errors import AuthApiError

from core import chat_sessions
from core.deps import get_current_user, get_optional_user
from core.supabase import get_admin_client, get_client
from schemas.auth import UserProfile
from schemas.session import OpenSessionRequest, StationSession

router = APIRouter(prefix="/station-sessions", tags=["station-sessions"])

def _insert_session(student_id: str, auth_method: str, station_id: str) -> dict:
    # Admin client: an ID tap has no login token.
    admin = get_admin_client()

    # Guests can't open a kiosk session; a librarian records their loans.
    # Every way of opening a session passes through here.
    role_res = admin.table("profiles").select("role").eq("id", student_id).execute()
    if role_res.data and role_res.data[0]["role"] == "guest":
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Guests can't sign in at the kiosk — please see the librarian for in-library use",
        )

    res = admin.table("station_sessions").insert({
        "student_id": student_id,
        "auth_method": auth_method,
        "station_id": station_id,
    }).execute()
    if not res.data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not open session")
    session = res.data[0]

    # First name for the kiosk greeting; program and college for its
    # "For you" tab.
    profile_res = admin.table("profiles").select("full_name, program, college").eq("id", student_id).execute()
    profile = profile_res.data[0] if profile_res.data else {}
    full_name = profile.get("full_name") or ""
    session["student_first_name"] = full_name.split(" ")[0] or "there"
    session["student_full_name"] = full_name or session["student_first_name"]
    session["program"] = profile.get("program")
    session["college"] = profile.get("college")
    return session

# Opens a kiosk session. No login token needed: the password or ID tap is
# the credential. librarian_assisted instead needs a librarian's login,
# since the student gives no credential.
@router.post("", response_model=StationSession, status_code=status.HTTP_201_CREATED)
def open_session(body: OpenSessionRequest, caller: UserProfile | None = Depends(get_optional_user)):
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

    elif body.auth_method == "librarian_assisted":
        if caller is None or caller.role != "librarian":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a librarian can open an assisted session")
        if not body.student_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "student_id is required for librarian_assisted")
        student_id = body.student_id

    else:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unsupported auth_method")

    return _insert_session(student_id, body.auth_method, body.station_id)

# For the student web portal: the student's login replaces retyping their
# password. Recorded as "manual_login".
@router.post("/from-token", response_model=StationSession, status_code=status.HTTP_201_CREATED)
def open_session_from_token(user: UserProfile = Depends(get_current_user)):
    return _insert_session(user.id, "manual_login", "web-portal")

# Ends a session (timeout, "Done", or a new tap). No login token, since a
# tapped session doesn't have one; the session id is hard to guess.
@router.post("/{session_id}/end", status_code=status.HTTP_204_NO_CONTENT)
def end_session(session_id: str):
    admin = get_admin_client()
    res = (
        admin
        .table("station_sessions")
        .update({"ended_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", session_id)
        .is_("ended_at", "null")
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found or already ended")

    # Delete the kiosk chat too (it shares this session's id).
    chat_sessions.end_session(admin, session_id, surface="kiosk")
