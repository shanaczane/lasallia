# apps/api/routers/sync.py
# Catalog import — librarian-only, same authorization boundary as
# routers/weeding.py. Takes either a Follett Destiny MARC 21 export (.mrc)
# or the LRC's own hand-encoded Excel sheet (.xlsx — what librarians can
# actually produce today, since they have no export access in Destiny).
# The librarian uploads the same file twice: first with dry_run=true to
# see the preview, then dry_run=false to apply it. Nothing is kept between
# the two calls; the apply re-plans against the catalog as it is at that
# moment. Matching rules live in core/importers/marc.py.

from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response

from core.deps import require_librarian
from core.embeddings import reembed_books
from core.importers.marc import ImportIssue, apply_plan, parse_marc, plan_import
from core.importers.spreadsheet import build_template, parse_spreadsheet
from core.supabase import get_admin_client
from schemas.auth import UserProfile
from schemas.sync import SyncPreview, SyncRun

router = APIRouter(prefix="/sync", tags=["sync"])

MAX_FILE_BYTES = 25 * 1024 * 1024
PAGE_SIZE = 1000  # PostgREST's default max rows per request


def _fetch_all(admin, table: str, columns: str) -> list[dict]:
    # The catalog can outgrow one PostgREST page — a partial read here would
    # make already-imported books look new and duplicate them.
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
    # Only books whose row changed since their last embedding are re-embedded
    # (see reembed_books), so this is proportional to what the import touched.
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
    # Spreadsheet only — the sheets don't say which college they're for
    # (seed_books.py took it from the file name); becomes books.subject.
    college: str | None = None,
    librarian: UserProfile = Depends(require_librarian),
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
        # One row per copy — rows read, not titles, is what the librarian
        # will recognize against their sheet.
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
    plan = plan_import(records, books, copies, parse_issues)
    if records_read is not None:
        plan.records_read = records_read

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


@router.get("/template")
def download_template(librarian: UserProfile = Depends(require_librarian)):
    return Response(
        content=build_template(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="lasallia-catalog-template.xlsx"'},
    )
