# Librarian profiles under the one shared librarian login: PIN hashing and
# the signed "active profile" token. The endpoints are in
# routers/librarian_profiles.py and the check is in core/deps.py.

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from core.config import LIBRARIAN_PROFILE_SECRET

MAX_FAILED_ATTEMPTS = 5
LOCK_SECONDS = 5 * 60

# The browser renews the token while the librarian is active, so its
# lifetime is the idle lock (library_settings.librarian_idle_timeout_minutes).
_ALGORITHM = "HS256"
_AUDIENCE = "librarian-profile"


class ProfileSecretMissing(RuntimeError):
    pass


def _secret() -> str:
    if not LIBRARIAN_PROFILE_SECRET:
        raise ProfileSecretMissing("LIBRARIAN_PROFILE_SECRET is not set")
    return LIBRARIAN_PROFILE_SECRET


def hash_pin(pin: str) -> str:
    return bcrypt.hashpw(pin.encode(), bcrypt.gensalt()).decode()


def pin_matches(pin: str, pin_hash: str) -> bool:
    return bcrypt.checkpw(pin.encode(), pin_hash.encode())


def issue_token(profile: dict, account_id: str, idle_minutes: int) -> tuple[str, datetime]:
    """A token for this profile, tied to the shared account that unlocked it."""
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=idle_minutes)
    token = jwt.encode(
        {
            "sub": profile["id"],
            "acct": account_id,
            "aud": _AUDIENCE,
            "iat": now,
            "exp": expires_at,
        },
        _secret(),
        algorithm=_ALGORITHM,
    )
    return token, expires_at


def profile_id_from_token(token: str, account_id: str) -> str | None:
    """The profile the token was issued to, or None if it's expired, forged
    or from another account."""
    try:
        claims = jwt.decode(token, _secret(), algorithms=[_ALGORITHM], audience=_AUDIENCE)
    except jwt.InvalidTokenError:
        return None
    return claims["sub"] if claims.get("acct") == account_id else None
