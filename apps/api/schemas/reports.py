# Report response models. Some field names are camelCase on purpose, to
# match the Reports page's own types.

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


class ProgramUsage(BaseModel):
    program: str
    users: int
    loans: int


class LibraryStats(BaseModel):
    total_titles: int
    total_copies: int
    active_borrowers: int
    overdue_count: int
    utilization_rate: float  # 0..1 — copies on loan / total copies
    most_active_category: str | None = None
    by_program: list[ProgramUsage] = []


class TransactionTrendPoint(BaseModel):
    label: str
    borrows: int
    returns: int


class TransactionStats(BaseModel):
    total_transactions: int
    loan_count: int
    reservation_count: int
    average_loan_duration_days: float | None = None


class FineEntryRow(BaseModel):
    title: str
    kind: str  # "unsettled" | "accruing" | "paid"
    amount: float
    detail: str
    # Lets the report mark this fine as paid (PATCH /loans/{loan_id}/settle-fine).
    loan_id: str


class FineRow(BaseModel):
    patron_id: str
    patron: str
    patron_email: str
    program: str
    year: str
    unsettled: float
    accruing: float
    paid: float
    outstanding: float
    entries: list[FineEntryRow] = []


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


# AI summary per report. None means no summary (no OpenAI key, or the
# call failed); never a placeholder.
class ReportSummaries(BaseModel):
    catalogue: str | None = None
    circulation: str | None = None
    top_patrons: str | None = None
    borrowing_trends: str | None = None
    library_stats: str | None = None
    transactions: str | None = None
    overdue: str | None = None
