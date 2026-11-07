# Catalog import from a MARC file (.mrc) or an LRC Excel sheet (.xlsx), and
# "Export new books" (core/exports.py). Librarians only. An import file is
# sent twice: dry_run=true for the preview, then dry_run=false to apply.
# Matching rules are in core/importers/marc.py.

from datetime import date, datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response

from core.accession import accession_counters
from core.deps import require_librarian, require_librarian_profile
from core.embeddings import reembed_books
from core.exports import build_new_copies_workbook, fetch_new_copies
from core.importers.marc import LARGE_JUMP, ImportIssue, apply_plan, parse_marc, plan_import
from core.importers.spreadsheet import build_template, parse_spreadsheet
from core.supabase import get_admin_client
from schemas.auth import UserProfile
from schemas.sync import SyncPreview, SyncRun

router = APIRouter(prefix="/sync", tags=["sync"])

MAX_FILE_BYTES = 25 * 1024 * 1024
PAGE_SIZE = 1000  # PostgREST's default max rows per request


def _fetch_all(admin, table: str, columns: str) -> list[dict]:
    # Read every page, or existing books would look new and be duplicated.
    rows: list[dict] = []
    start = 0
    while True:
        page = admin.table(table).select(columns).range(start, start + PAGE_SIZE - 1).execute().data
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            return rows
        start += PAGE_SIZE


def _issue_dict(issue: ImportIssue) -> dict:
    return {"record": issue.record, "title": issue.title, "message": issue.message, "location": issue.location}


def _reembed_in_background() -> None:
    # Only re-embeds books the import changed.
    try:
        count = reembed_books(get_admin_client())
        print(f"sync: re-embedded {count} book(s) after import")
    except Exception as e:
        print(f"sync: re-embedding after import failed: {e}")


@router.post("/catalog", response_model=SyncPreview)
def import_catalog(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    dry_run: bool = True,
    # Spreadsheets only: the college isn't in the file, so it's passed in.
    college: str | None = None,
    # Required to apply a file with copies far above the accession counter
    # (see large_jumps in the preview).
    confirm_large_jumps: bool = False,
    librarian: UserProfile = Depends(require_librarian_profile),
):
    data = file.file.read(MAX_FILE_BYTES + 1)
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "The export file is larger than 25 MB")
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The uploaded file is empty")

    warnings: list[ImportIssue] = []
    if (file.filename or "").lower().endswith(".xlsx"):
        source = "lrc_spreadsheet"
        try:
            records, parse_issues, warnings = parse_spreadsheet(data, college)
        except ValueError as e:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
        if not records and not parse_issues:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "No book rows found. Use the template's column headers, starting with Title and Book ID (Accession No.).",
            )
        # Count rows (copies), which is what the librarian sees in their sheet.
        records_read = len(parse_issues) + sum(len(r.barcodes) for r in records)
    else:
        source = "destiny_marc"
        records, parse_issues = parse_marc(data)
        if not records:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "No MARC records could be read from this file. Export the catalog from Destiny as MARC 21 (.mrc), or upload the LRC Excel sheet (.xlsx).",
            )
        records_read = None

    admin = get_admin_client()
    books = _fetch_all(
        admin, "books", "id, title, author, isbn, call_number, publisher, published_year, abstract, accession_no, archived_at, shelf_location"
    )
    copies = _fetch_all(admin, "book_copies", "book_id, accession_number")
    plan = plan_import(records, books, copies, parse_issues, counters=accession_counters(admin))
    if records_read is not None:
        plan.records_read = records_read

    if not dry_run and plan.large_jumps and not confirm_large_jumps:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{len(plan.large_jumps)} copy number(s) are more than {LARGE_JUMP:,} above the next accession "
            "number. Check them in the preview and confirm before importing.",
        )

    errors = list(plan.errors)
    run_id = None
    if not dry_run:
        synced_at = datetime.now(timezone.utc).isoformat()
        errors.extend(apply_plan(admin, plan, synced_at))
        run = admin.table("sync_runs").insert({
            "source": source,
            "file_name": file.filename,
            "started_by": librarian.id,
            "records_read": plan.records_read,
            "books_added": plan.count("add"),
            "books_updated": plan.count("update"),
            "books_unchanged": plan.count("unchanged"),
            "copies_added": plan.copies_added,
            "errors": [_issue_dict(e) for e in errors],
        }).execute().data
        run_id = run[0]["id"] if run else None
        if plan.count("add") or plan.count("update"):
            background.add_task(_reembed_in_background)

    return SyncPreview(
        dry_run=dry_run,
        source=source,
        file_name=file.filename,
        records_read=plan.records_read,
        books_added=plan.count("add"),
        books_updated=plan.count("update"),
        books_unchanged=plan.count("unchanged"),
        copies_added=plan.copies_added,
        items=[
            {
                "action": i.action,
                "record": i.record,
                "title": i.title,
                "author": i.author,
                "book_id": i.book_id,
                "matched_by": i.matched_by,
                "archived": i.archived,
                "changes": [{"field": c.field, "old": c.old, "new": c.new} for c in i.changes],
                "new_copies": i.new_copies,
                "copies_not_in_export": i.copies_not_in_export,
                "location": i.location,
            }
            for i in plan.items
            if i.action != "unchanged"
        ],
        errors=[_issue_dict(e) for e in errors],
        warnings=[_issue_dict(w) for w in warnings],
        large_jumps=[
            {"accession": j.accession, "title": j.title, "next_value": j.next_value, "location": j.location}
            for j in plan.large_jumps
        ],
        run_id=run_id,
    )


@router.get("/runs", response_model=list[SyncRun])
def list_runs(limit: int = 20, librarian: UserProfile = Depends(require_librarian)):
    admin = get_admin_client()
    runs = admin.table("sync_runs").select("*").order("created_at", desc=True).limit(limit).execute().data
    user_ids = list({r["started_by"] for r in runs if r.get("started_by")})
    names = {}
    if user_ids:
        names = {
            p["id"]: p.get("full_name")
            for p in admin.table("profiles").select("id, full_name").in_("id", user_ids).execute().data
        }
    return [{**r, "started_by_name": names.get(r.get("started_by"))} for r in runs]


@router.get("/export-new-copies")
def export_new_copies(
    date_from: date,
    date_to: date,
    # Copies entered with "Register existing copy" already had a number, so
    # they may already be in the library's system.
    include_registered: bool = False,
    librarian: UserProfile = Depends(require_librarian_profile),
):
    """Excel file of copies Lasallia added between two dates (Manila time,
    both included). Read-only."""
    if date_from > date_to:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The start date is after the end date.")
    rows = fetch_new_copies(get_admin_client(), date_from, date_to, include_registered)
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No copies were added in this date range.")
    filename = f"lasallia-new-copies-{date_from.isoformat()}-to-{date_to.isoformat()}.xlsx"
    return Response(
        content=build_new_copies_workbook(rows),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/template")
def download_template(librarian: UserProfile = Depends(require_librarian)):
    return Response(
        content=build_template(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="lasallia-catalog-template.xlsx"'},
    )
