from typing import Literal

from pydantic import BaseModel

AuthMethod = Literal["manual_login", "rfid"]

class OpenSessionRequest(BaseModel):
    station_id: str
    auth_method: AuthMethod
    # manual_login
    email: str | None = None
    password: str | None = None
    # rfid
    rfid_uid: str | None = None

class StationSession(BaseModel):
    id: str
    student_id: str
    auth_method: AuthMethod
    station_id: str
    started_at: str
    ended_at: str | None = None
