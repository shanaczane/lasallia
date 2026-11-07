from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, status

from core import chat_sessions
from core.desk import kiosk_notices
from core.deps import get_current_user, get_optional_user, verify_active_profile
from core.supabase import get_admin_client
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
    # "For you" tab; role and year level for the user type on the screen.
    profile_res = admin.table("profiles").select("full_name, program, college, role, year_level").eq("id", student_id).execute()
    profile = profile_res.data[0] if profile_res.data else {}
    full_name = profile.get("full_name") or ""
    session["student_first_name"] = full_name.split(" ")[0] or "there"
    session["student_full_name"] = full_name or session["student_first_name"]
    session["program"] = profile.get("program")
    session["college"] = profile.get("college")
    session["role"] = profile.get("role")
    session["year_level"] = profile.get("year_level")
    # Pickups, fines and overdue books, shown on the kiosk after the tap.
    session.update(kiosk_notices(admin, student_id))
    return session

# Opens a kiosk session. No login token needed: the ID tap is the
# credential. Typing an email and password at the kiosk isn't allowed, since
# it's a shared screen. librarian_assisted instead needs a librarian's
# login, since the student gives no credential.
@router.post("", response_model=StationSession, status_code=status.HTTP_201_CREATED)
def open_session(
    body: OpenSessionRequest,
    caller: UserProfile | None = Depends(get_optional_user),
    librarian_profile: str | None = Header(None, alias="X-Librarian-Profile"),
):
    if body.auth_method == "rfid":
        if not body.rfid_uid:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "rfid_uid is required for rfid")
        profile_res = get_admin_client().table("profiles").select("id").eq("rfid_uid", body.rfid_uid).execute()
        if not profile_res.data:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown RFID tag")
        student_id = profile_res.data[0]["id"]

    elif body.auth_method == "librarian_assisted":
        if caller is None or caller.role != "librarian":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a librarian can open an assisted session")
        verify_active_profile(caller, librarian_profile)
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
