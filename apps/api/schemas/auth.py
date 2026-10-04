from pydantic import BaseModel
from typing import Literal

Role = Literal["librarian", "student", "faculty", "guest"]

class LoginRequest(BaseModel):
    email: str
    password: str

class RefreshRequest(BaseModel):
    refresh_token: str

class UserProfile(BaseModel):
    id: str
    email: str
    role: Role
    full_name: str | None = None
    # Self-service fields (Settings/Profile page) — same columns
    # schemas/patron.Patron exposes to a librarian looking someone else up,
    # just also readable by the account itself via GET /auth/me.
    program: str | None = None
    year_level: int | None = None
    college: str | None = None
    # School-issued student/faculty number (0045) — unique same as email,
    # just assigned by the school instead of chosen by the account holder.
    id_number: str | None = None
    # Mirrors schemas/patron.PatronStatus. get_current_user/login reject a
    # request outright when this is "inactive" (see core/deps.py), so any
    # caller that actually receives a UserProfile is implicitly active —
    # carried here mainly so the frontend never has to special-case it.
    status: Literal["active", "inactive"] | None = None

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserProfile

# Settings' Account tab, PATCH /auth/me — self-service, not the same
# authorization boundary as PATCH /users/{id} (routers/patrons.py, a
# librarian editing someone *else's* account status). Just full_name —
# email change needs Supabase Auth's own confirm-by-email flow, a
# separate feature; password change is its own request below.
#
# program/year_level/college (Google sign-in "complete your profile" form):
# every field is optional so the same endpoint serves both the Settings name
# change and that form; only the fields actually sent are updated. rfid_uid
# is deliberately NOT here — a card can only be assigned by a librarian.
class UpdateProfileRequest(BaseModel):
    full_name: str | None = None
    program: str | None = None
    year_level: int | None = None
    college: str | None = None
    id_number: str | None = None

# POST /auth/change-password. current_password re-verifies identity
# (sign_in_with_password against it) before the new one is set — same
# reasoning any "change password" flow re-checks the old one: a
# still-open browser tab alone shouldn't be enough to take over the
# account if someone walks up to it.
class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

# GET /auth/password-status — lets Settings show "Set a password" (no
# current-password field) for an account that doesn't have one yet (e.g.
# Google sign-in, which never sets one) instead of "Change Password".
class PasswordStatusResponse(BaseModel):
    has_password: bool

# POST /auth/set-password. No current_password field, unlike
# ChangePasswordRequest above — there's nothing to verify against for an
# account that has never had a password. The endpoint itself re-checks
# has_password server-side before applying this, so a caller can't use this
# route to skip ChangePasswordRequest's current-password check on an
# account that already has one.
class SetPasswordRequest(BaseModel):
    new_password: str
