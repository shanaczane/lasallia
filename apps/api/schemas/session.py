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
    auth_method: AuthMethod
    station_id: str
    started_at: str
    ended_at: str | None = None
