from typing import Literal

from pydantic import BaseModel

AuthMethod = Literal["manual_login", "rfid", "librarian_assisted"]

class OpenSessionRequest(BaseModel):
    station_id: str
    auth_method: AuthMethod
    # manual_login
    email: str | None = None
    password: str | None = None
    # rfid
    rfid_uid: str | None = None
    # librarian_assisted — the librarian already found the student via
    # GET /users?q=, so their own JWT is the credential, not the student's.
    student_id: str | None = None

class StationSession(BaseModel):
    id: str
    student_id: str
    student_first_name: str
    # The kiosk TopNav's account badge wants the same full name the web
    # portal shows (StudentLayout/LibrarianLayout both read profiles.full_name)
    # rather than the first-name-only greeting — first_name stays as-is since
    # the greeting/"Borrowing as" copy elsewhere is deliberately first-name-only.
    student_full_name: str
    auth_method: AuthMethod
    station_id: str
    started_at: str
    ended_at: str | None = None
    # Sprint 5.7's dashboard "New Arrivals"/Program/College sections
    # (components/ui/dashboard/CatalogHighlights.tsx) need these to
    # personalize the kiosk's "For you" tab the same way — a kiosk tap has
    # no JWT for GET /auth/me to read them from, so they ride on the
    # session itself instead, same reasoning student_first_name already
    # does for the kiosk's greeting.
    program: str | None = None
    college: str | None = None
