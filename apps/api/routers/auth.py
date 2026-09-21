from fastapi import APIRouter, HTTPException, status, Depends
from supabase_auth.errors import AuthApiError
from schemas.auth import ChangePasswordRequest, LoginRequest, RefreshRequest, TokenResponse, UpdateProfileRequest, UserProfile
from core.supabase import get_client, get_admin_client
from core.deps import get_current_user, invalidate_profile

router = APIRouter(prefix="/auth", tags=["auth"])

MIN_PASSWORD_LENGTH = 8
MAX_YEAR_LEVEL = 8  # same ceiling routers/patrons.py enforces for a librarian's edit

def _fetch_profile(user_id: str) -> dict:
    res = get_admin_client().table("profiles").select("role, full_name, program, year_level, college").eq("id", user_id).single().execute()
    return res.data or {}

def _build_token_response(session, sb_user) -> TokenResponse:
    profile = _fetch_profile(sb_user.id)
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

    # Academic fields are for students only — a guest has no program, and
    # a librarian's is set by another librarian through the Patrons screen.
    if {"program", "year_level", "college"} & sent.keys():
        if user.role != "student":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only students can set a program or year level")
        if "program" in sent:
            program = (sent["program"] or "").strip()
            if not program:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Program can't be empty")
            changes["program"] = program
        if "year_level" in sent:
            year = sent["year_level"]
            if year is None or not (1 <= year <= MAX_YEAR_LEVEL):
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Year Level must be between 1 and {MAX_YEAR_LEVEL}")
            changes["year_level"] = year
        if "college" in sent:
            changes["college"] = (sent["college"] or "").strip() or None

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
        get_admin_client().auth.admin.update_user_by_id(user.id, {"password": body.new_password})
    except AuthApiError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
