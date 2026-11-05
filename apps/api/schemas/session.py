from typing import Literal

from pydantic import BaseModel

# manual_login is what web-portal sessions are recorded as (and what older
# kiosk sessions were). It can't be used to open a kiosk session.
AuthMethod = Literal["manual_login", "rfid", "librarian_assisted"]

class OpenSessionRequest(BaseModel):
    station_id: str
    auth_method: Literal["rfid", "librarian_assisted"]
    # rfid
    rfid_uid: str | None = None
    # librarian_assisted: the librarian's login is the credential.
    student_id: str | None = None

class StationSession(BaseModel):
    id: str
    student_id: str
    student_first_name: str
    # Full name for the kiosk's account badge (greetings use the first name).
    student_full_name: str
    auth_method: AuthMethod
    station_id: str
    started_at: str
    ended_at: str | None = None
    # For the kiosk's "For you" tab, which has no login to read them from.
    program: str | None = None
    college: str | None = None
