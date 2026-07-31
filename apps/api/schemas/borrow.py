from typing import Literal

from pydantic import BaseModel

from schemas.auth import UserProfile
from schemas.book import Book

BorrowStatus = Literal["active", "returned", "overdue"]

class BorrowTransaction(BaseModel):
    id: str
    user_id: str
    book_id: str
    borrowed_at: str
    due_date: str
    returned_at: str | None = None
    status: BorrowStatus
    fine_amount: float | None = None
    books: Book | None = None       # embedded via the books FK, when selected
    profiles: UserProfile | None = None  # embedded via the user_id FK — the borrowing patron

class CreateBorrowRequest(BaseModel):
    book_id: str
    patron_email: str
