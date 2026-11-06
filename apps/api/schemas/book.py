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
# Matches the book form in BookFormModal.tsx. Accession numbers and copy
# counts aren't book fields any more: copies are rows in book_copies, and
# their numbers come from the database counter (POST /books) or from the
# label already on the book (register). total_copies/available_copies sent
# by an older client are ignored.

class BookWrite(BaseModel):
    # Only accepted so an older form gets a clear error instead of the
    # value being silently dropped; see create_book/update_book.
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
    purchase_price: float | None = None
    date_acquired: str | None = None
    circulation_type: str | None = None
    vendor: str | None = None
    funding_source: FundingSource | None = None
    notes: str | None = None
    collection_type: str | None = None

class BookCreate(BookWrite):
    copy_count: int = Field(default=1, ge=1, le=50)
    prefix: str = Field(default="T", pattern=r"^[A-Za-z]{1,5}$")
    # Set after the librarian sees the "same title and author" warning for a
    # book with no ISBN and chooses to catalog it anyway.
    confirm_possible_duplicate: bool = False

class BookUpdate(BookWrite):
    pass

# A save that created copies also returns the numbers it assigned, so the
# librarian can write or print them on the books.
class BookWithNewCopies(LibrarianBook):
    assigned_accession_numbers: list[str] = []

class AddCopiesRequest(BaseModel):
    count: int = Field(ge=1, le=50)
    prefix: str = Field(default="T", pattern=r"^[A-Za-z]{1,5}$")

# A copy that already has a number printed on it.
class RegisterCopyRequest(BaseModel):
    accession_number: str = Field(min_length=1, max_length=40)
    # Needed when the number is more than 1,000 above its prefix's counter.
    confirm_large_jump: bool = False

class CorrectAccessionRequest(BaseModel):
    new_accession: str = Field(min_length=1, max_length=40)
    reason: str = Field(min_length=1, max_length=500)
    confirm_large_jump: bool = False

class AccessionCorrection(BaseModel):
    id: str
    book_copy_id: str | None = None
    old_value: str
    new_value: str
    reason: str
    corrected_by: str | None = None
    corrected_by_name: str | None = None
    corrected_at: str
