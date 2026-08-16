# apps/api/routers/reports.py
# Reports plan, Phase 1 — thin HTTP layer over core/reports.py. All
# endpoints are require_librarian, reused as-is from routers/patrons.py
# rather than inventing a new auth pattern.

from fastapi import APIRouter, Depends

from core.deps import require_librarian
from core.reports import (
    ReportFilters,
    borrowing_trends,
    catalogue_report,
    circulation_summary,
    library_stats,
    overdue_rows,
    shelf_list,
    top_patrons,
    transaction_stats,
)
from core.supabase import get_admin_client
from schemas.auth import UserProfile
from schemas.reports import Bucket, CatalogueSlice, LibraryStats, OverdueRow, ShelfListRow, TopPatron, TransactionStats

router = APIRouter(prefix="/reports", tags=["reports"])


def report_filters(
    date_from: str | None = None,
    date_to: str | None = None,
    category: str | None = None,
    program: str | None = None,
    year_level: int | None = None,
) -> ReportFilters:
    return ReportFilters(date_from=date_from, date_to=date_to, category=category, program=program, year_level=year_level)


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
