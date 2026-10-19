# Report endpoints (librarians only). Logic is in core/reports.py.

from fastapi import APIRouter, Depends

from core.deps import require_librarian
from core.inventory import list_sessions, report_items
from core.report_summaries import summarize_many
from core.reports import (
    ReportFilters,
    borrowing_trends,
    catalogue_report,
    circulation_summary,
    fines_report,
    library_stats,
    overdue_rows,
    shelf_list,
    top_patrons,
    transaction_stats,
    transaction_trend,
)
from core.supabase import get_admin_client
from schemas.auth import UserProfile
from schemas.inventory import InventoryReportItem, InventorySession
from schemas.reports import (
    Bucket,
    CatalogueSlice,
    FineRow,
    LibraryStats,
    OverdueRow,
    ReportSummaries,
    ShelfListRow,
    TopPatron,
    TransactionStats,
    TransactionTrendPoint,
)

router = APIRouter(prefix="/reports", tags=["reports"])


def report_filters(
    date_from: str | None = None,
    date_to: str | None = None,
    category: str | None = None,
    program: str | None = None,
    college: str | None = None,
    year_level: int | None = None,
) -> ReportFilters:
    return ReportFilters(
        date_from=date_from, date_to=date_to, category=category,
        program=program, college=college, year_level=year_level,
    )


@router.get("/catalogue", response_model=list[CatalogueSlice])
def get_catalogue(
    filters: ReportFilters = Depends(report_filters),
    librarian: UserProfile = Depends(require_librarian),
):
    return catalogue_report(get_admin_client(), filters)


@router.get("/circulation-summary", response_model=list[Bucket])
def get_circulation_summary(
    months: int = 6,
    filters: ReportFilters = Depends(report_filters),
    librarian: UserProfile = Depends(require_librarian),
):
    return circulation_summary(get_admin_client(), filters, months=months)


@router.get("/borrowing-trends", response_model=list[Bucket])
def get_borrowing_trends(
    weeks: int = 8,
    filters: ReportFilters = Depends(report_filters),
    librarian: UserProfile = Depends(require_librarian),
):
    return borrowing_trends(get_admin_client(), filters, weeks=weeks)


@router.get("/transaction-trend", response_model=list[TransactionTrendPoint])
def get_transaction_trend(
    weeks: int = 8,
    filters: ReportFilters = Depends(report_filters),
    librarian: UserProfile = Depends(require_librarian),
):
    return transaction_trend(get_admin_client(), filters, weeks=weeks)


@router.get("/top-patrons", response_model=list[TopPatron])
def get_top_patrons(
    limit: int = 5,
    filters: ReportFilters = Depends(report_filters),
    librarian: UserProfile = Depends(require_librarian),
):
    return top_patrons(get_admin_client(), filters, limit=limit)


@router.get("/overdue", response_model=list[OverdueRow])
def get_overdue(
    filters: ReportFilters = Depends(report_filters),
    librarian: UserProfile = Depends(require_librarian),
):
    return overdue_rows(get_admin_client(), filters)


@router.get("/fines", response_model=list[FineRow])
def get_fines(
    filters: ReportFilters = Depends(report_filters),
    librarian: UserProfile = Depends(require_librarian),
):
    return fines_report(get_admin_client(), filters)


@router.get("/library-stats", response_model=LibraryStats)
def get_library_stats(
    filters: ReportFilters = Depends(report_filters),
    librarian: UserProfile = Depends(require_librarian),
):
    return library_stats(get_admin_client(), filters)


@router.get("/transactions", response_model=TransactionStats)
def get_transaction_stats(
    filters: ReportFilters = Depends(report_filters),
    librarian: UserProfile = Depends(require_librarian),
):
    return transaction_stats(get_admin_client(), filters)


@router.get("/shelf-list", response_model=list[ShelfListRow])
def get_shelf_list(
    floor: str | None = None,
    aisle: str | None = None,
    filters: ReportFilters = Depends(report_filters),
    librarian: UserProfile = Depends(require_librarian),
):
    return shelf_list(get_admin_client(), filters, floor=floor, aisle=aisle)


# Reports > Inventory — one row per check ("Export summary") and one row
# per copy per check ("Export details"). Only the date range applies.
@router.get("/inventory", response_model=list[InventorySession])
def get_inventory(
    filters: ReportFilters = Depends(report_filters),
    librarian: UserProfile = Depends(require_librarian),
):
    return list_sessions(get_admin_client(), limit=500, date_from=filters.date_from, date_to=filters.date_to)


@router.get("/inventory/items", response_model=list[InventoryReportItem])
def get_inventory_items(
    filters: ReportFilters = Depends(report_filters),
    librarian: UserProfile = Depends(require_librarian),
):
    return report_items(get_admin_client(), date_from=filters.date_from, date_to=filters.date_to)


@router.get("/summaries", response_model=ReportSummaries)
def get_summaries(
    filters: ReportFilters = Depends(report_filters),
    librarian: UserProfile = Depends(require_librarian),
):
    # Recompute the numbers here rather than accept them from the browser,
    # so the AI can't be fed made-up figures.
    admin = get_admin_client()
    payloads = {
        "catalogue": catalogue_report(admin, filters),
        "circulation": circulation_summary(admin, filters),
        "top_patrons": top_patrons(admin, filters),
        "borrowing_trends": borrowing_trends(admin, filters),
        "library_stats": library_stats(admin, filters),
        "transactions": transaction_stats(admin, filters),
        "overdue": overdue_rows(admin, filters),
    }
    return ReportSummaries(**summarize_many(payloads))
