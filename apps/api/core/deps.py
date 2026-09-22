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

# Role/full_name for a user id, cached briefly. Every authenticated request
# used to spend one Supabase round trip on this before the endpoint's own
# queries even started. 60s means a role change (rare — librarian promotes an
# account) can take up to a minute to apply on this instance; anything that
# must apply immediately calls invalidate_profile().
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
            # Clock drift between this server and Supabase's is normal and
            # expected (observed ~13s in practice) — PyJWT's default leeway
            # is 0, which means *any* drift rejects every token as
            # "not yet valid" (iat) or expired a hair early. This was
            # silently breaking every authenticated endpoint.
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

    # Role/full_name come from the profiles table, not the JWT's
    # user_metadata claim. That claim is only ever set at Supabase-user-
    # creation time (e.g. evals/run_eval.py's admin.create_user call) and
    # nothing ever patches it afterward — a real student signing in via
    # Google OAuth has no such claim at all, so this silently resolved to
    # the "guest" default here even though profiles.role correctly says
    # "student", causing every role-gated endpoint (require_student,
    # require_librarian, /recommendations/me's own check) to 403 a
    # legitimate account. profiles is already the source of truth
    # routers/auth.py's login/refresh use to build the role a client
    # sees (_build_token_response) — this makes server-side authorization
    # agree with that instead of trusting a claim nothing keeps in sync.
    profile_res = get_admin_client().table("profiles").select("role, full_name, program, year_level, college").eq("id", payload["sub"]).execute()
    profile = profile_res.data[0] if profile_res.data else {}
    role: Role = profile.get("role") or meta.get("role", "guest")

    return UserProfile(
        id=payload["sub"],
        email=payload.get("email", ""),
        role=role,
        full_name=profile.get("full_name") or meta.get("full_name"),
        program=profile.get("program"),
        year_level=profile.get("year_level"),
        college=profile.get("college"),
    )

# A kiosk tap never produces a JWT — the station session IS the identity (its id
# is the credential, the same way holds/loans already treat it). A live,
# un-ended station session for a real student resolves to that student, which
# is what lets the kiosk chat and the kiosk For You tab know who is tapped in.
# A guest kiosk visit's id matches no row and resolves to None.
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
    """Like get_current_user, but returns None instead of 401 when there's no
    (or an invalid) token — for endpoints public callers can reach, where a
    librarian caller nonetheless gets to see more."""
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
# Faculty use the same site and borrowing rules as students (no separate
# role-gated endpoints for them) — every check that used to mean "student or
# librarian" means "student, faculty, or librarian" now. Kept the name
# require_student since that's still what it reads as at every call site.
require_student = require_role("librarian", "student", "faculty")
# Book requests (routers/book_requests.py) — strictly faculty, not "student
# or faculty" like require_student above. A librarian manages the catalog
# directly and has no reason to submit one; letting a librarian through here
# would blur who a submitted request is actually from.
require_faculty = require_role("faculty")
