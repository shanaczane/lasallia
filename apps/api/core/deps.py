import json
import time
import jwt
import httpx
from jwt.algorithms import ECAlgorithm
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client
from schemas.auth import UserProfile, Role
from core.config import SUPABASE_URL
from core.supabase import get_admin_client, get_user_client

bearer = HTTPBearer()
optional_bearer = HTTPBearer(auto_error=False)

# Short cache of each user's role and name. A role change can take up to a
# minute to apply; call invalidate_profile() to apply it immediately.
_PROFILE_TTL_SECONDS = 60
_profile_cache: dict[str, tuple[float, dict]] = {}

def invalidate_profile(user_id: str) -> None:
    _profile_cache.pop(user_id, None)

def _load_profile(user_id: str) -> dict:
    hit = _profile_cache.get(user_id)
    if hit and time.monotonic() - hit[0] < _PROFILE_TTL_SECONDS:
        return hit[1]
    res = get_admin_client().table("profiles").select("role, full_name").eq("id", user_id).execute()
    profile = res.data[0] if res.data else {}
    _profile_cache[user_id] = (time.monotonic(), profile)
    return profile

# Cache the public key fetched from Supabase's JWKS endpoint
_public_key = None

def _get_public_key():
    global _public_key
    if _public_key is None:
        try:
            resp = httpx.get(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json", timeout=10)
            resp.raise_for_status()
            keys = resp.json()["keys"]
            
            _public_key = ECAlgorithm.from_jwk(json.dumps(keys[0]))
        except Exception as e:
            raise RuntimeError(f"Failed to fetch Supabase JWKS: {e}")
    return _public_key

def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(
            token,
            _get_public_key(),
            algorithms=["ES256"],
            audience="authenticated",
            # Allow for small clock differences with Supabase, or valid
            # tokens get rejected.
            leeway=60,
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
) -> UserProfile:
    payload = _decode_token(credentials.credentials)
    meta = payload.get("user_metadata", {})

    # Role comes from the profiles table, not the token. The token's role
    # isn't kept up to date (Google sign-ins don't have one at all).
    profile_res = get_admin_client().table("profiles").select("role, full_name, program, year_level, college, id_number, status, privacy_accepted_at, privacy_notice_version").eq("id", payload["sub"]).execute()
    profile = profile_res.data[0] if profile_res.data else {}
    role: Role = profile.get("role") or meta.get("role", "guest")

    # Checked on every request, so a deactivated account loses access right
    # away, even in a session that's already open.
    if profile.get("status") == "inactive":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been deactivated. Please contact a librarian.")

    return UserProfile(
        id=payload["sub"],
        email=payload.get("email", ""),
        role=role,
        full_name=profile.get("full_name") or meta.get("full_name"),
        program=profile.get("program"),
        year_level=profile.get("year_level"),
        college=profile.get("college"),
        id_number=profile.get("id_number"),
        status=profile.get("status"),
        privacy_accepted_at=profile.get("privacy_accepted_at"),
        privacy_notice_version=profile.get("privacy_notice_version"),
    )

# The kiosk has no login token; an open station session identifies the
# student who tapped in. Guests and ended sessions return None.
def kiosk_session_user(admin: Client, session_id: str | None) -> UserProfile | None:
    if not session_id:
        return None
    try:
        session = admin.table("station_sessions").select("student_id, ended_at").eq("id", session_id).execute().data
        if not session or session[0]["ended_at"] is not None:
            return None
        profile = admin.table("profiles").select("id, email, role, full_name").eq("id", session[0]["student_id"]).execute().data
    except Exception:
        return None
    return UserProfile(**profile[0]) if profile and profile[0]["role"] == "student" else None

def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_bearer),
) -> UserProfile | None:
    """Like get_current_user, but returns None instead of a 401, for public
    endpoints that show more to logged-in users."""
    if credentials is None:
        return None
    try:
        return get_current_user(credentials)
    except HTTPException:
        return None

def get_user_supabase(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
) -> Client:
    return get_user_client(credentials.credentials)

def require_role(*roles: Role):
    def _check(user: UserProfile = Depends(get_current_user)) -> UserProfile:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        return user
    return _check

require_librarian = require_role("librarian")
# Students and faculty share the same rules (librarians are allowed too).
require_student = require_role("librarian", "student", "faculty")
# Faculty only (book requests). Librarians are deliberately excluded.
require_faculty = require_role("faculty")
