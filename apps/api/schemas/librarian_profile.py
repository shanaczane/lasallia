# Librarian profiles. PIN hashes and card ids are never returned.

from datetime import datetime

from pydantic import BaseModel, Field

PIN_PATTERN = r"^\d{4,6}$"


class ProfileOption(BaseModel):
    """One name on the "Who is using Lasallia?" screen."""
    id: str
    full_name: str
    locked_seconds: int = 0


class ManagedProfile(BaseModel):
    id: str
    full_name: str
    is_active: bool
    has_staff_card: bool
    locked_until: datetime | None = None
    created_at: datetime


class SignInRequest(BaseModel):
    # One or the other.
    pin: str | None = Field(None, pattern=PIN_PATTERN)
    rfid_uid: str | None = Field(None, max_length=128)


class ActiveProfileSession(BaseModel):
    token: str
    expires_at: datetime
    profile_id: str
    full_name: str
    idle_timeout_minutes: int


class CreateProfileRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=120)
    pin: str = Field(pattern=PIN_PATTERN)


class UpdateProfileRequest(BaseModel):
    full_name: str | None = Field(None, min_length=1, max_length=120)
    is_active: bool | None = None


class ResetPinRequest(BaseModel):
    pin: str = Field(pattern=PIN_PATTERN)


class LinkCardRequest(BaseModel):
    rfid_uid: str = Field(min_length=1, max_length=128)
