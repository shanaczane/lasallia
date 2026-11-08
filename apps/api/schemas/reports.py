# Report response models. Some field names are camelCase on purpose, to
# match the Reports page's own types.

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class CatalogueSlice(BaseModel):
    label: str
    titles: int  # books (titles) in the category
    copies: int  # their copies in book_copies
    value: int   # same as copies; what the bar length uses
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


# ─── Report export (PDF / Excel / CSV), core/report_export ─────────────

ExportableReport = Literal[
    "overdue", "circulation", "borrowing_stats", "top_patrons", "fines", "catalog", "shelf_list",
    "weeding_candidates", "weeding_log", "inventory", "book_requests",
    "top_titles", "reservations", "accession_register", "library_usage", "assistant_usage",
    "overview", "activity_log",
]


class ReportExportFilters(BaseModel):
    report: ExportableReport
    # Whole Manila days, both included. Leave out for all dates.
    date_from: date | None = None
    date_to: date | None = None
    category: str | None = Field(None, max_length=200)
    program: str | None = Field(None, max_length=200)
    college: str | None = Field(None, max_length=200)
    year_level: int | None = Field(None, ge=1, le=10)
    # Shelf list only.
    floor: str | None = Field(None, max_length=100)
    aisle: str | None = Field(None, max_length=100)


class ReportExportRequest(ReportExportFilters):
    format: Literal["pdf", "xlsx", "csv"]
    # CSV only: the main table, or the detail table (Inventory's copies).
    csv_table: Literal["main", "details"] = "main"
    # The summary the librarian reviewed. Left out: the computed summary.
    summary_text: str | None = Field(None, max_length=2000)
    # Where the reviewed text started: the AI draft or the computed summary.
    summary_source: Literal["ai", "computed"] = "computed"
    # Typed at export time; never saved.
    prepared_by_name: str | None = Field(None, max_length=120)
    noted_by_name: str | None = Field(None, max_length=120)
    approved_by_name: str | None = Field(None, max_length=120)


class ReportKeyFigure(BaseModel):
    label: str
    value: str


class ReportSignatureTitle(BaseModel):
    key: str     # prepared_by | noted_by | approved_by
    label: str   # "Prepared by"
    title: str   # job title from Settings
    placeholder: bool  # still the placeholder, not confirmed by the library


class ReportExportPreview(BaseModel):
    title: str
    period: str
    filters: list[str]
    key_figures: list[ReportKeyFigure]
    computed_summary: str
    row_count: int
    # False for snapshot reports (catalog, shelf list, weeding candidates):
    # "as of" now, so the date filter doesn't apply.
    uses_dates: bool = True
    # A second table (Inventory's copies): its own Excel sheet, a CSV option.
    details_title: str | None = None
    details_row_count: int = 0
    signature_titles: list[ReportSignatureTitle]


class ReportExportColumn(BaseModel):
    key: str
    label: str
    kind: Literal["text", "int", "plain", "money", "date"]


class ReportExportRows(BaseModel):
    """A report's table for the page: the export's own columns and rows."""
    title: str
    period: str
    columns: list[ReportExportColumn]
    rows: list[dict[str, str | int | float | None]]
    empty_message: str


class ReportAiSummary(BaseModel):
    # None when AI isn't available or failed; use the computed summary.
    summary: str | None
