# Report endpoints (librarians only). Logic is in core/reports.py.

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response

from core.dates import report_bound
from core.deps import require_librarian
from core.inventory import list_sessions, report_items
from core.report_export.csv_file import build_csv
from core.report_export.definitions import REPORTS, ExportFilters, ReportData
from core.report_export.excel import build_excel
from core.report_export.layout import (
    SIGNATURE_ROLES,
    ExportOptions,
    report_header,
    signatories,
    signature_titles,
    summary_label,
)
from core.report_export.pdf import build_pdf
from core.report_summaries import aggregate_overdue, aggregate_top_patrons, summarize_aggregate, summarize_many
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
from core.settings import get_library_settings
from core.supabase import get_admin_client
from schemas.auth import UserProfile
from schemas.inventory import InventoryReportItem, InventorySession
from schemas.reports import (
    Bucket,
    CatalogueSlice,
    FineRow,
    LibraryStats,
    OverdueRow,
    ReportAiSummary,
    ReportExportFilters,
    ReportExportPreview,
    ReportExportRequest,
    ReportKeyFigure,
    ReportSignatureTitle,
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
    # A plain date ("2026-11-30") means the whole Manila day: from its first
    # instant, to its last.
    return ReportFilters(
        date_from=report_bound(date_from, end=False), date_to=report_bound(date_to, end=True), category=category,
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
    # so the AI can't be fed made-up figures. Reports about people are sent
    # as counts only, never names or emails.
    admin = get_admin_client()
    payloads = {
        "catalogue": catalogue_report(admin, filters),
        "circulation": circulation_summary(admin, filters),
        "top_patrons": aggregate_top_patrons(top_patrons(admin, filters)),
        "borrowing_trends": borrowing_trends(admin, filters),
        "library_stats": library_stats(admin, filters),
        "transactions": transaction_stats(admin, filters),
        "overdue": aggregate_overdue(overdue_rows(admin, filters)),
    }
    return ReportSummaries(**summarize_many(payloads))


# ─── Report export: PDF, Excel and CSV built on the server ──────────────
# One definition per report (core/report_export/definitions.py); the
# exporters only render it. Only Overdue Loans is converted so far.

_EXPORT_TYPES = {
    "pdf": ("application/pdf", "pdf"),
    "xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
    "csv": ("text/csv; charset=utf-8", "csv"),
}


def _export_data(body: ReportExportFilters) -> ReportData:
    if body.date_from and body.date_to and body.date_from > body.date_to:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The start date is after the end date.")
    filters = ExportFilters(
        date_from=body.date_from, date_to=body.date_to, category=body.category,
        program=body.program, college=body.college, year_level=body.year_level,
        floor=body.floor, aisle=body.aisle,
    )
    return REPORTS[body.report].build(get_admin_client(), filters)


@router.post("/export/preview", response_model=ReportExportPreview)
def preview_export(body: ReportExportFilters, librarian: UserProfile = Depends(require_librarian)):
    """What the export dialog shows: period, key figures, the computed
    summary and the signature titles."""
    data = _export_data(body)
    titles = signature_titles(get_library_settings(get_admin_client()))
    return ReportExportPreview(
        title=data.title,
        period=data.period,
        filters=data.filters,
        key_figures=[ReportKeyFigure(label=f.label, value=f.value) for f in data.key_figures],
        computed_summary=data.computed_summary,
        row_count=len(data.rows),
        uses_dates=data.uses_dates,
        details_title=data.details.title if data.details else None,
        details_row_count=len(data.details.rows) if data.details else 0,
        signature_titles=[
            ReportSignatureTitle(key=key, label=label, title=titles[key], placeholder=titles[key] == placeholder)
            for key, label, placeholder in SIGNATURE_ROLES
        ],
    )


@router.post("/export/ai-summary", response_model=ReportAiSummary)
def ai_summary_for_export(body: ReportExportFilters, librarian: UserProfile = Depends(require_librarian)):
    """An AI draft for the librarian to review. Only the report's totals
    and breakdowns are sent to OpenAI. None when AI isn't available."""
    data = _export_data(body)
    return ReportAiSummary(summary=summarize_aggregate(data.title, data.ai_payload))


@router.post("/export")
def export_report(body: ReportExportRequest, librarian: UserProfile = Depends(require_librarian)):
    """The report as a file. Rows, key figures and chart are recomputed here;
    only the reviewed summary text and the signatory names come from the
    browser."""
    data = _export_data(body)
    media_type, extension = _EXPORT_TYPES[body.format]
    filename = f"{data.filename_stem}.{extension}"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}

    if body.format == "csv":
        if body.csv_table == "details" and data.details is not None:
            headers = {"Content-Disposition": f'attachment; filename="{data.filename_stem}_details.csv"'}
        return Response(content=build_csv(data, body.csv_table), media_type=media_type, headers=headers)

    settings = get_library_settings(get_admin_client())
    reviewed = (body.summary_text or "").strip()
    text = reviewed or data.computed_summary
    source = body.summary_source if reviewed else "computed"
    options = ExportOptions(
        header=report_header(settings),
        summary_text=text,
        summary_label=summary_label(source, text, data.computed_summary),
        signatories=signatories(settings, {
            "prepared_by": body.prepared_by_name,
            "noted_by": body.noted_by_name,
            "approved_by": body.approved_by_name,
        }),
    )
    content = build_pdf(data, options) if body.format == "pdf" else build_excel(data, options)
    return Response(content=content, media_type=media_type, headers=headers)
