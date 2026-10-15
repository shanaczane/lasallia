# apps/api/core/shelf_reports.py
# "Can't find this book on the shelf" reports (migration 0056). A student
# who can't find a book the catalog says is available reports it from the
# book page; the librarian is notified and checks just that one book
# instead of running a whole-aisle inventory check.

from datetime import datetime, timezone

from fastapi import HTTPException, status
from postgrest.exceptions import APIError
from supabase import Client

from core.inventory import book_location_label
from core.notify import notify_librarians
from schemas.shelf_report import ShelfReport


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _open_report(admin: Client, book_id: str) -> dict | None:
    rows = admin.table("shelf_reports").select("*").eq("book_id", book_id).eq("status", "open").execute().data
    return rows[0] if rows else None


def _to_models(admin: Client, rows: list[dict]) -> list[ShelfReport]:
    if not rows:
        return []
    book_ids = list({r["book_id"] for r in rows})
    books = {
        b["id"]: b
        for b in admin.table("books").select("id, title, call_number, floor, aisle").in_("id", book_ids).execute().data
    }
    available: dict[str, int] = {}
    for c in admin.table("book_copies").select("book_id").in_("book_id", book_ids).eq("status", "available").execute().data:
        available[c["book_id"]] = available.get(c["book_id"], 0) + 1
    reporter_ids = list({r["reported_by"] for r in rows})
    names = {
        p["id"]: p["full_name"]
        for p in admin.table("profiles").select("id, full_name").in_("id", reporter_ids).execute().data
    }
    return [
        ShelfReport(
            id=r["id"], book_id=r["book_id"],
            title=books.get(r["book_id"], {}).get("title") or "Untitled",
            call_number=books.get(r["book_id"], {}).get("call_number"),
            location=book_location_label(books.get(r["book_id"], {})),
            available_copies=available.get(r["book_id"], 0),
            reported_by_name=names.get(r["reported_by"]),
            created_at=r["created_at"],
        )
        for r in rows
    ]


def report_book(admin: Client, book_id: str, reporter_id: str, reporter_name: str | None) -> ShelfReport:
    """Opens a report and notifies the librarians. If this book already has
    an open report, returns that one without notifying again."""
    books = admin.table("books").select("id, title, floor, aisle").eq("id", book_id).execute().data
    if not books:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Book not found")
    book = books[0]

    existing = _open_report(admin, book_id)
    if existing:
        return _to_models(admin, [existing])[0]
    try:
        row = admin.table("shelf_reports").insert({"book_id": book_id, "reported_by": reporter_id}).execute().data[0]
    except APIError:
        # Another student reported it at the same moment — the partial
        # unique index let only one through.
        existing = _open_report(admin, book_id)
        if existing:
            return _to_models(admin, [existing])[0]
        raise

    who = reporter_name or "A student"
    notify_librarians(
        "Book not found on its shelf",
        f'{who} couldn\'t find "{book["title"]}" in {book_location_label(book)}. Please check that shelf.',
        link="/librarian/inventory#reported",
    )
    return _to_models(admin, [row])[0]


def list_open_reports(admin: Client) -> list[ShelfReport]:
    rows = admin.table("shelf_reports").select("*").eq("status", "open").order("created_at").execute().data
    return _to_models(admin, rows)


def resolve_report(admin: Client, report_id: str, action: str, librarian_id: str) -> None:
    rows = admin.table("shelf_reports").select("*").eq("id", report_id).execute().data
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    report = rows[0]
    if report["status"] != "open":
        raise HTTPException(status.HTTP_409_CONFLICT, "This report was already handled")

    if action == "missing":
        # The copies the catalog said were on the shelf aren't there. Copies
        # on loan, reserved or on the reshelving cart aren't touched.
        admin.table("book_copies").update({"status": "missing"}).eq("book_id", report["book_id"]).eq("status", "available").execute()

    admin.table("shelf_reports").update({
        "status": "resolved",
        "resolution": "marked_missing" if action == "missing" else "on_shelf",
        "resolved_by": librarian_id,
        "resolved_at": _now(),
    }).eq("id", report_id).execute()
