from typing import Literal

from pydantic import BaseModel

BookStatus = Literal["available", "borrowed", "reserved", "misplaced"]
BookFormat = Literal["print", "digital", "reference"]

class Book(BaseModel):
    id: str
    accession_no: str | None = None
    title: str
    author: str
    isbn: str | None = None
    call_number: str
    category: str
    subject: str | None = None
    shelf_location: str
    floor: str | None = None
    aisle: str | None = None
    status: BookStatus
    cover_url: str | None = None
    cover_color: str | None = None
    abstract: str | None = None
    keywords: list[str] | None = None
    published_year: int | None = None
    publisher: str | None = None
    format: BookFormat | None = None
    total_copies: int | None = None
    available_copies: int | None = None
    call_number_start: str | None = None
    expected_back: str | None = None  # soonest due_date among copies out, computed on read
    waiting_count: int | None = None  # pending + ready reservations for this title
    created_at: str
    updated_at: str

class BookSearchResponse(BaseModel):
    books: list[Book]
    total: int
    page: int
    per_page: int
