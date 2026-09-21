from pydantic import BaseModel
from typing import Literal

Role = Literal["librarian", "student", "guest"]

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

# POST /auth/change-password. current_password re-verifies identity
# (sign_in_with_password against it) before the new one is set — same
# reasoning any "change password" flow re-checks the old one: a
# still-open browser tab alone shouldn't be enough to take over the
# account if someone walks up to it.
class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
