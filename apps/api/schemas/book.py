from typing import Literal

from pydantic import BaseModel, Field

BookStatus = Literal["available", "borrowed", "reserved", "for_reshelving", "missing", "misplaced"]
BookFormat = Literal["print", "digital", "reference"]
FundingSource = Literal["purchased", "donated", "grant"]

class Book(BaseModel):
    id: str
    accession_no: str | None = None
    title: str
    subtitle: str | None = None
    alternate_title: str | None = None
    author: str
    isbn: str | None = None
    lccn: str | None = None
    issn: str | None = None
    edition: str | None = None
    series_title: str | None = None
    series_volume: str | None = None
    place_of_publication: str | None = None
    physical_extent: str | None = None
    physical_illustrations: str | None = None
    physical_dimensions: str | None = None
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
    reserved_copies: int | None = None
    call_number_start: str | None = None
    expected_back: str | None = None  # soonest due_date among copies out, computed on read
    waiting_count: int | None = None  # pending + ready reservations for this title
    # Lets the frontend hide Borrow/Reserve for library-use-only books (the
    # server blocks them anyway).
    collection_type: str | None = None
    created_at: str
    updated_at: str

# Internal acquisition details, never shown to patrons. Kept off `Book` so
# they're dropped from every other response; the catalog hides them from
# non-librarians.
LIBRARIAN_ONLY_FIELDS = (
    "purchase_price", "date_acquired", "circulation_type", "vendor", "funding_source", "notes",
)

class LibrarianBook(Book):
    purchase_price: float | None = None
    date_acquired: str | None = None
    circulation_type: str | None = None
    vendor: str | None = None
    funding_source: FundingSource | None = None
    notes: str | None = None  # internal staff notes

class BookSearchResponse(BaseModel):
    books: list[LibrarianBook]
    total: int
    page: int
    per_page: int

class BookCopy(BaseModel):
    id: str
    accession_number: str
    status: str
    shelf_location: str | None = None
    # Only for copies out on loan: who has it and when it's due.
    borrower_name: str | None = None
    due_date: str | None = None

# ── Librarian write endpoints ───────────────────────────────────────────
# Matches the book form in BookFormModal.tsx.

class BookWrite(BaseModel):
    accession_no: str | None = None
    title: str
    subtitle: str | None = None
    alternate_title: str | None = None
    author: str
    isbn: str | None = None
    lccn: str | None = None
    issn: str | None = None
    edition: str | None = None
    series_title: str | None = None
    series_volume: str | None = None
    place_of_publication: str | None = None
    physical_extent: str | None = None
    physical_illustrations: str | None = None
    physical_dimensions: str | None = None
    call_number: str
    category: str
    subject: str | None = None
    shelf_location: str
    floor: str | None = None
    aisle: str | None = None
    status: BookStatus = "available"
    cover_url: str | None = None
    abstract: str | None = None
    keywords: list[str] | None = None
    published_year: int | None = None
    publisher: str | None = None
    format: BookFormat | None = None
    total_copies: int | None = None
    available_copies: int | None = None
    purchase_price: float | None = None
    date_acquired: str | None = None
    circulation_type: str | None = None
    vendor: str | None = None
    funding_source: FundingSource | None = None
    notes: str | None = None
    collection_type: str | None = None

class BookUpdate(BookWrite):
    pass

# POST /books/{book_id}/add-copies. Only raises the counters on books; it
# doesn't create real copies, so books that have copies show no change.
class AddCopiesRequest(BaseModel):
    count: int = Field(ge=1)
