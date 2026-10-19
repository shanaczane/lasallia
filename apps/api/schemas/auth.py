from pydantic import BaseModel
from datetime import datetime
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
    # Fields the user can see and edit on their own profile.
    program: str | None = None
    year_level: int | None = None
    college: str | None = None
    # School-issued student/faculty number, unique like email.
    id_number: str | None = None
    # Inactive accounts are rejected at login, so this is normally "active".
    status: Literal["active", "inactive"] | None = None
    # First-login privacy notice. None = not accepted yet.
    privacy_accepted_at: datetime | None = None
    privacy_notice_version: str | None = None

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserProfile

# PATCH /auth/me: edit your own profile. Only sent fields are updated.
# The ID card (rfid_uid) isn't here; only librarians can assign it.
class UpdateProfileRequest(BaseModel):
    full_name: str | None = None
    program: str | None = None
    year_level: int | None = None
    college: str | None = None
    id_number: str | None = None

# POST /auth/change-password. The current password is required, so an
# unattended open tab can't be used to take over the account.
class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

# GET /auth/password-status: whether to show "Set a password" (Google-only
# accounts) or "Change password".
class PasswordStatusResponse(BaseModel):
    has_password: bool

# POST /auth/set-password: a first password for an account with none. The
# server refuses it if a password already exists.
class SetPasswordRequest(BaseModel):
    new_password: str
