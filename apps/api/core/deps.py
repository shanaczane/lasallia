import json
import jwt
import httpx
from jwt.algorithms import ECAlgorithm
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client
from schemas.auth import UserProfile, Role
from core.config import SUPABASE_URL
from core.supabase import get_user_client

bearer = HTTPBearer()

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
    role: Role = meta.get("role", "guest")
    return UserProfile(
        id=payload["sub"],
        email=payload.get("email", ""),
        role=role,
        full_name=meta.get("full_name"),
    )

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
require_student = require_role("librarian", "student")
