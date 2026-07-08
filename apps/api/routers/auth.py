from fastapi import APIRouter, HTTPException, status, Depends
from supabase_auth.errors import AuthApiError
from schemas.auth import LoginRequest, RefreshRequest, TokenResponse, UserProfile
from core.supabase import get_client, get_admin_client
from core.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

def _fetch_profile(user_id: str) -> dict:
    res = get_admin_client().table("profiles").select("role, full_name").eq("id", user_id).single().execute()
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
