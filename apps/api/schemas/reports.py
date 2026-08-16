# apps/api/schemas/reports.py
# Reports plan, Phase 1. The first five models mirror
# apps/web/app/librarian/reports/page.tsx's existing local types field-
# for-field (including the frontend's own camelCase names on OverdueRow)
# — that's what makes the frontend change a data-source swap instead of
# a rewrite. LibraryStats/TransactionStats/ShelfListRow are new report
# types with no prior frontend shape to match, so they use normal
# Python naming.

from pydantic import BaseModel


class CatalogueSlice(BaseModel):
    label: str
    value: int
    color: str


class Bucket(BaseModel):
    label: str
    value: int


class TopPatron(BaseModel):
    id: str
    name: str
    program: str
    count: int


class OverdueRow(BaseModel):
    id: str
    patron: str
    patronEmail: str
    program: str
    year: str
    book: str
    author: str
    dueDate: str
    daysOverdue: int
    fine: float


class LibraryStats(BaseModel):
    total_titles: int
    total_copies: int
    active_borrowers: int
    overdue_count: int
    utilization_rate: float  # 0..1 — copies on loan / total copies
    most_active_category: str | None = None


class TransactionStats(BaseModel):
    total_transactions: int
    loan_count: int
    reservation_count: int
    average_loan_duration_days: float | None = None


class ShelfListRow(BaseModel):
    accession_number: str
    book_id: str
    title: str
    author: str
    call_number: str
    category: str
    shelf_location: str | None = None
    floor: str | None = None
    aisle: str | None = None
    status: str
