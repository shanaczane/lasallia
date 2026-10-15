from typing import Literal

from pydantic import BaseModel


# A student's "Can't find this book on the shelf" report (migration 0056).
class ShelfReport(BaseModel):
    id: str
    book_id: str
    title: str
    call_number: str | None = None
    location: str  # where the book belongs
    available_copies: int  # copies the catalog says are on the shelf right now
    reported_by_name: str | None = None
    created_at: str


class ResolveShelfReportRequest(BaseModel):
    # on_shelf: the librarian found it where it belongs.
    # missing: it really isn't there; every available copy is marked missing.
    action: Literal["on_shelf", "missing"]
