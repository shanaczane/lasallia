from typing import Literal

from pydantic import BaseModel

PatronRole = Literal["student", "faculty", "librarian", "guest"]
PatronStatus = Literal["active", "inactive"]

# Separate from schemas.auth.UserProfile (the minimal JWT-derived identity
# used for auth checks) — this is the richer patron-management record the
# librarian Patrons screen actually needs, mirroring packages/types/user.ts.
class Patron(BaseModel):
    id: str
    email: str
    # Nullable — profiles created by Supabase Auth's signup trigger don't
    # require it. This was previously a required str here, which meant
    # GET /users would 500 for *every* patron the instant a single row
    # had a null full_name — the response_model validation rejects the
    # whole list, not just that one row.
    full_name: str | None = None
    role: PatronRole
    program: str | None = None
    year_level: int | None = None
    avatar_url: str | None = None
    status: PatronStatus | None = None
    created_at: str

# All fields optional — PATCH only writes what's actually included (same
# exclude_unset convention as UpdateLibrarySettingsRequest). Previously
# named UpdatePatronStatusRequest and status-only: every real student row
# in the database has program/year_level as null (nothing has ever let a
# librarian set them — the Patrons screen was view-and-deactivate only),
# so this is now the one request model for everything the Patrons screen
# can edit about an account.
class UpdatePatronRequest(BaseModel):
    status: PatronStatus | None = None
    program: str | None = None
    year_level: int | None = None
