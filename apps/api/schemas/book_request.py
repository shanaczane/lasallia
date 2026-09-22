from pydantic import BaseModel

RequestStatus = str  # 'pending' | 'approved' | 'rejected' | 'fulfilled' — see migrations/0039
RequestFormat = str  # 'print' | 'ebook' | 'either' — see migrations/0041


# Embedded via the requester_id -> profiles(id) foreign key (same
# *.select("*, table(...)") embed PostgREST does for saved_books.books) —
# lets the librarian list show who asked without a second round trip.
class RequesterInfo(BaseModel):
    full_name: str | None = None
    email: str
    college: str | None = None


class Attachment(BaseModel):
    id: str
    url: str
    name: str
    created_at: str


class BookRequest(BaseModel):
    id: str
    requester_id: str
    title: str
    author: str | None = None
    isbn: str | None = None
    note: str | None = None
    format: RequestFormat
    copies: int
    course: str | None = None
    status: RequestStatus
    reviewed_by: str | None = None
    reviewed_at: str | None = None
    created_at: str
    updated_at: str
    profiles: RequesterInfo | None = None
    # Aliased embed of book_request_attachments (0042) — PostgREST returns
    # the reverse side of a one-to-many FK as a list under whatever name
    # the select string gives it (see routers/book_requests.py's _SELECT).
    attachments: list[Attachment] = []


class CreateBookRequestRequest(BaseModel):
    title: str
    author: str | None = None
    isbn: str | None = None
    note: str | None = None
    format: RequestFormat = "either"
    copies: int = 1
    course: str | None = None


class UpdateBookRequestRequest(BaseModel):
    status: RequestStatus | None = None


# Faculty editing their own not-yet-reviewed request — deliberately separate
# from UpdateBookRequestRequest (the librarian's status-only PATCH, which
# also stamps reviewed_by/reviewed_at). Every field is optional so a caller
# only sends what actually changed.
class UpdateOwnBookRequestRequest(BaseModel):
    title: str | None = None
    author: str | None = None
    isbn: str | None = None
    note: str | None = None
    format: RequestFormat | None = None
    copies: int | None = None
    course: str | None = None
