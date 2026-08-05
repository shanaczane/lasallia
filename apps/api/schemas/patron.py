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
    full_name: str
    role: PatronRole
    program: str | None = None
    year_level: int | None = None
    avatar_url: str | None = None
    status: PatronStatus | None = None
    created_at: str

class UpdatePatronStatusRequest(BaseModel):
    status: PatronStatus
