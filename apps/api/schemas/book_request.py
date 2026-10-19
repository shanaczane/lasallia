from pydantic import BaseModel

RequestStatus = str  # 'pending' | 'approved' | 'rejected' | 'fulfilled' | 'cancelled'
RequestFormat = str  # 'print' | 'ebook' | 'either'


# Who submitted the request, embedded from profiles.
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
    # Embedded from book_request_attachments.
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


# Faculty editing their own pending request. Send only the fields that changed.
class UpdateOwnBookRequestRequest(BaseModel):
    title: str | None = None
    author: str | None = None
    isbn: str | None = None
    note: str | None = None
    format: RequestFormat | None = None
    copies: int | None = None
    course: str | None = None
