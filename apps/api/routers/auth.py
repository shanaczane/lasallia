from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status, Depends
from supabase_auth.errors import AuthApiError
from postgrest.exceptions import APIError
from schemas.auth import ChangePasswordRequest, LoginRequest, PasswordStatusResponse, RefreshRequest, SetPasswordRequest, TokenResponse, UpdateProfileRequest, UserProfile
from core.supabase import get_client, get_admin_client
from core.deps import get_current_user, invalidate_profile

router = APIRouter(prefix="/auth", tags=["auth"])

MIN_PASSWORD_LENGTH = 8
MAX_YEAR_LEVEL = 8  # same as routers/patrons.py

# Saved with each privacy-notice acceptance. Change it when the official
# notice text replaces the draft, so test acceptances can be told apart.
PRIVACY_NOTICE_VERSION = "placeholder"

# Checked up front so a duplicate ID number gives a clear 400, not a 500.
def _check_id_number_conflict(id_number: str, exclude_user_id: str) -> None:
    res = (
        get_admin_client().table("profiles")
        .select("id").eq("id_number", id_number).neq("id", exclude_user_id).execute()
    )
    if res.data:
        raise HTTPException(status.HTTP_409_CONFLICT, f'ID number "{id_number}" is already in use by another account')

def _fetch_profile(user_id: str) -> dict:
    res = get_admin_client().table("profiles").select("role, full_name, program, year_level, college, id_number, status, privacy_accepted_at, privacy_notice_version").eq("id", user_id).single().execute()
    return res.data or {}

def _build_token_response(session, sb_user) -> TokenResponse:
    profile = _fetch_profile(sb_user.id)

    # Deactivated accounts can't sign in, even with the right password.
    if profile.get("status") == "inactive":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been deactivated. Please contact a librarian.")

    return TokenResponse(
        access_token=session.access_token,
        refresh_token=session.refresh_token,
        expires_in=session.expires_in,
        user=UserProfile(
            id=sb_user.id,
            email=sb_user.email or "",
            role=profile.get("role", "guest"),
            full_name=profile.get("full_name"),
            program=profile.get("program"),
            year_level=profile.get("year_level"),
            college=profile.get("college"),
            id_number=profile.get("id_number"),
            status=profile.get("status"),
            privacy_accepted_at=profile.get("privacy_accepted_at"),
            privacy_notice_version=profile.get("privacy_notice_version"),
        ),
    )

@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest):
    try:
        res = get_client().auth.sign_in_with_password(
            {"email": body.email, "password": body.password}
        )
    except AuthApiError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e))
    return _build_token_response(res.session, res.user)

@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(user: UserProfile = Depends(get_current_user)):
    get_client().auth.sign_out()

@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest):
    try:
        res = get_client().auth.refresh_session(body.refresh_token)
    except AuthApiError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e))
    return _build_token_response(res.session, res.user)

@router.get("/me", response_model=UserProfile)
def me(user: UserProfile = Depends(get_current_user)):
    return user

# Records acceptance of the privacy notice. The server sets the time and
# version; an earlier acceptance is never overwritten.
@router.post("/accept-privacy", response_model=UserProfile)
def accept_privacy(user: UserProfile = Depends(get_current_user)):
    if user.privacy_accepted_at:
        return user
    accepted_at = datetime.now(timezone.utc)
    get_admin_client().table("profiles").update({
        "privacy_accepted_at": accepted_at.isoformat(),
        "privacy_notice_version": PRIVACY_NOTICE_VERSION,
    }).eq("id", user.id).execute()
    invalidate_profile(user.id)
    return user.model_copy(update={"privacy_accepted_at": accepted_at, "privacy_notice_version": PRIVACY_NOTICE_VERSION})

# Edit your own profile. Always the logged-in user; there's no user_id
# in the request.
@router.patch("/me", response_model=UserProfile)
def update_me(body: UpdateProfileRequest, user: UserProfile = Depends(get_current_user)):
    sent = body.model_dump(exclude_unset=True)
    if not sent:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No changes given")

    changes: dict = {}

    if "full_name" in sent:
        name = (sent["full_name"] or "").strip()
        if not name:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Full name can't be empty")
        changes["full_name"] = name

    # Students can set program, year level, college and ID number. Faculty
    # can set college and ID number. Others can't set any of these.
    if {"program", "year_level", "college", "id_number"} & sent.keys():
        if user.role not in ("student", "faculty"):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only students and faculty can set these fields")
        if "program" in sent:
            if user.role != "student":
                raise HTTPException(status.HTTP_403_FORBIDDEN, "Only students set a program — faculty set a college instead")
            program = (sent["program"] or "").strip()
            if not program:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Program can't be empty")
            changes["program"] = program
        if "year_level" in sent:
            if user.role != "student":
                raise HTTPException(status.HTTP_403_FORBIDDEN, "Faculty don't have a year level")
            year = sent["year_level"]
            if year is None or not (1 <= year <= MAX_YEAR_LEVEL):
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Year Level must be between 1 and {MAX_YEAR_LEVEL}")
            changes["year_level"] = year
        if "college" in sent:
            changes["college"] = (sent["college"] or "").strip() or None
        if "id_number" in sent:
            id_number = (sent["id_number"] or "").strip()
            if not id_number:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "ID number can't be empty")
            _check_id_number_conflict(id_number, user.id)
            changes["id_number"] = id_number

    get_admin_client().table("profiles").update(changes).eq("id", user.id).execute()
    invalidate_profile(user.id)
    return UserProfile(
        id=user.id,
        email=user.email,
        role=user.role,
        full_name=changes.get("full_name", user.full_name),
        program=changes.get("program", user.program),
        year_level=changes.get("year_level", user.year_level),
        college=changes["college"] if "college" in changes else user.college,
        id_number=changes.get("id_number", user.id_number),
        privacy_accepted_at=user.privacy_accepted_at,
        privacy_notice_version=user.privacy_notice_version,
    )

# Change password. The current password is checked by signing in with it;
# then the admin client sets the new one.
@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(body: ChangePasswordRequest, user: UserProfile = Depends(get_current_user)):
    if len(body.new_password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"New password must be at least {MIN_PASSWORD_LENGTH} characters")

    try:
        get_client().auth.sign_in_with_password({"email": user.email, "password": body.current_password})
    except AuthApiError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")

    try:
        get_admin_client().auth.admin.update_user_by_id(user.id, _password_update(body.new_password))
    except AuthApiError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))

# Whether this account has a password (Google-only accounts don't).
# Checks the user_has_password database function first, then the older
# signals (app_metadata.has_password, an 'email' identity). RPC errors other
# than "function missing" are retried, then raised, never treated as "no
# password", which would wrongly show the set-a-password prompt.
def _has_password_identity(user_id: str) -> bool:
    for attempt in range(3):
        try:
            if get_admin_client().rpc("user_has_password", {"uid": user_id}).execute().data:
                return True
            break
        except Exception as e:
            if isinstance(e, APIError) and e.code == "PGRST202":
                break
            if attempt == 2:
                raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Could not check your account")
    sb_user = get_admin_client().auth.admin.get_user_by_id(user_id).user
    if (sb_user.app_metadata or {}).get("has_password"):
        return True
    return any(i.provider == "email" for i in (sb_user.identities or []))

# Used by change_password and set_password. Also marks has_password.
def _password_update(new_password: str) -> dict:
    return {"password": new_password, "app_metadata": {"has_password": True}}

# Tells Settings whether to show "Set a password" or "Change password".
@router.get("/password-status", response_model=PasswordStatusResponse)
def password_status(user: UserProfile = Depends(get_current_user)):
    return PasswordStatusResponse(has_password=_has_password_identity(user.id))

# Set a first password on a Google-only account. Refused if the account
# already has one, so it can't skip change_password's check.
@router.post("/set-password", status_code=status.HTTP_204_NO_CONTENT)
def set_password(body: SetPasswordRequest, user: UserProfile = Depends(get_current_user)):
    if len(body.new_password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Password must be at least {MIN_PASSWORD_LENGTH} characters")

    if _has_password_identity(user.id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This account already has a password — use Change Password instead")

    try:
        get_admin_client().auth.admin.update_user_by_id(user.id, _password_update(body.new_password))
    except AuthApiError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
