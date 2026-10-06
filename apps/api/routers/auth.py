from fastapi import APIRouter, HTTPException, status, Depends
from supabase_auth.errors import AuthApiError
from schemas.auth import ChangePasswordRequest, LoginRequest, PasswordStatusResponse, RefreshRequest, SetPasswordRequest, TokenResponse, UpdateProfileRequest, UserProfile
from core.supabase import get_client, get_admin_client
from core.deps import get_current_user, invalidate_profile

router = APIRouter(prefix="/auth", tags=["auth"])

MIN_PASSWORD_LENGTH = 8
MAX_YEAR_LEVEL = 8  # same ceiling routers/patrons.py enforces for a librarian's edit

# Same shape as routers/books.py's _check_accession_conflict — pre-checked
# with a SELECT rather than relying on the DB's unique index (0045) to
# reject it, so a collision comes back as a readable 400 instead of a raw
# integrity-error 500. routers/patrons.py has its own copy of this for a
# librarian's edit, same duplication MAX_YEAR_LEVEL above already has.
def _check_id_number_conflict(id_number: str, exclude_user_id: str) -> None:
    res = (
        get_admin_client().table("profiles")
        .select("id").eq("id_number", id_number).neq("id", exclude_user_id).execute()
    )
    if res.data:
        raise HTTPException(status.HTTP_409_CONFLICT, f'ID number "{id_number}" is already in use by another account')

def _fetch_profile(user_id: str) -> dict:
    res = get_admin_client().table("profiles").select("role, full_name, program, year_level, college, id_number, status").eq("id", user_id).single().execute()
    return res.data or {}

def _build_token_response(session, sb_user) -> TokenResponse:
    profile = _fetch_profile(sb_user.id)

    # A correct password shouldn't still hand a deactivated account a
    # working session — same rule core/deps.get_current_user enforces on
    # every later request, checked again here so it's refused up front.
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

# Settings' Account tab. Self-service only — scoped to user.id from the
# caller's own verified token, same as every other "me" endpoint; there's
# no user_id in the request body for that reason, so there's nothing to
# check against an id that isn't already the caller's own.
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

    # Academic fields are for students and faculty only — a guest has no
    # program, and a librarian's is set by another librarian through the
    # Patrons screen. Faculty have no year level (and their "program" is a
    # college, not a degree program — see routers/patrons.py's comment on
    # the same distinction), so program/year_level are student-only;
    # college and id_number (0045 — a faculty number is exactly as much
    # "theirs" to set as a student number) are the fields both self-service
    # roles can set.
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
    )

# Settings' Account tab "Change Password". current_password is verified by
# actually signing in with it (same call /login makes) — if that fails,
# the caller's own access token alone was never treated as proof they
# still know the current password. Only once that succeeds does the
# admin client (service-role — the only way to set a password directly,
# no email link/reset flow) apply the new one.
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

# A Google sign-in never sets a password — app_metadata.providers stays
# ['google'] forever, even after a password is added later (verified by
# hand against a real Supabase project: it does NOT grow an 'email' entry).
# The actual signal is the identities list, which does gain an 'email'
# entry the moment a password is set (admin.update_user_by_id, same call
# change_password/set_password use) — confirmed the same way. Checked
# here rather than cached on the JWT/profile: it can change mid-session
# (a student sets a password after already being logged in), and this is
# only called from the Settings page, not every request.
#
# In practice the 'email' identity did NOT reliably appear after
# set_password, so the dashboard banner / first-login modal kept asking
# after a password was already set. Every password write now also stamps
# app_metadata.has_password (service-role only — a user can't set
# app_metadata on themselves), and that flag counts too.
#
# Neither covers a password set before that stamp existed, so the
# first-login modal still came back on every refresh for those accounts.
# user_has_password (migration 0046) reads auth.users.encrypted_password
# directly and is checked first; the older signals stay as a fallback in
# case the migration hasn't been applied yet.
def _has_password_identity(user_id: str) -> bool:
    try:
        if get_admin_client().rpc("user_has_password", {"uid": user_id}).execute().data:
            return True
    except Exception:
        pass
    sb_user = get_admin_client().auth.admin.get_user_by_id(user_id).user
    if (sb_user.app_metadata or {}).get("has_password"):
        return True
    return any(i.provider == "email" for i in (sb_user.identities or []))

# Shared by change_password/set_password. app_metadata is merged by
# Supabase, not replaced, so 'provider'/'providers' are left intact.
def _password_update(new_password: str) -> dict:
    return {"password": new_password, "app_metadata": {"has_password": True}}

# Settings' Account tab — tells the frontend whether to show "Set a
# password" (Google-only account, no current password to verify) or the
# existing "Change Password" form (current_password required).
@router.get("/password-status", response_model=PasswordStatusResponse)
def password_status(user: UserProfile = Depends(get_current_user)):
    return PasswordStatusResponse(has_password=_has_password_identity(user.id))

# Settings' Account tab "Set a password" — for a Google-only account that
# has never had one. Unlike change_password above, there's no
# current_password to verify (there's nothing to check it against); the
# real-world equivalent of that re-verification is already satisfied by
# the caller holding a valid, currently-signed-in JWT at all. Re-checks
# has_password itself (not just trusting the frontend only showed this
# form when appropriate) so this can never be used to bypass
# change_password's current-password check on an account that already has
# one — Google login keeps working unaffected either way, this only adds
# a second way in.
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
