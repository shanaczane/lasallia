from typing import Literal

from pydantic import BaseModel

PatronRole = Literal["student", "faculty", "librarian", "guest"]
PatronStatus = Literal["active", "inactive"]

# A patron as shown on the librarian Patrons screen (more than UserProfile).
class Patron(BaseModel):
    id: str
    email: str
    # Optional: some profiles have no name, and a required field would
    # break the whole list.
    full_name: str | None = None
    role: PatronRole
    program: str | None = None
    year_level: int | None = None
    # School-issued student/faculty number, unique like email.
    id_number: str | None = None
    # A college code (CITE, CBEAM, CEAS, CITHM, CON, GEN-AD, GRADUATE SCHOOL).
    # May be empty; the frontend then guesses it from `program`.
    college: str | None = None
    avatar_url: str | None = None
    status: PatronStatus | None = None
    created_at: str

# Everything a librarian can edit on an account. Only sent fields are saved.
class UpdatePatronRequest(BaseModel):
    status: PatronStatus | None = None
    program: str | None = None
    year_level: int | None = None
    college: str | None = None
    id_number: str | None = None
