# "Export new books": an Excel file of the copies Lasallia added in a date
# range, for loading into the library's own system. Read-only.
#
# One row per copy, with the book's details repeated on each row, and one
# sheet per program, in the LRC workbook layout (core/importers/spreadsheet.py
# reads it back). Only copies Lasallia numbered (origin 'assigned') are
# included, plus "Register existing copy" ones when asked. Imported copies
# and copies with no origin are never included.

import io
import re
from dataclasses import dataclass
from datetime import date, datetime

import openpyxl

from core.accession import accession_sort_key
from core.dates import MANILA, manila_day_bounds, parse_timestamp, utc_text
from core.importers.spreadsheet import NOTES_SHEET, TEMPLATE_COLUMNS, TEMPLATE_SHEET
from core.report_export.cells import put_cell
from core.reports import _fetch_all_rows

EXTRA_COLUMNS = ["College", "Program", "Date Added", "Added As"]
EXPORT_COLUMNS = TEMPLATE_COLUMNS + EXTRA_COLUMNS
UNCATEGORISED = "Uncategorised"

# Sheet names the importer refuses or skips, and one Excel reserves.
_RESERVED_SHEET_NAMES = {TEMPLATE_SHEET.lower(), NOTES_SHEET.lower(), "history"}
_INVALID_SHEET_CHARS = re.compile(r"[\[\]:*?/\\]")
_BOOK_ID_CHUNK = 100  # ids per in_() filter, to keep the URL short


@dataclass
class ExportRow:
    accession_number: str
    created_at: datetime  # in Manila time
    new_title: bool
    title: str
    author: str | None
    published_year: int | None
    place_of_publication: str | None
    publisher: str | None
    call_number: str | None
    abstract: str | None
    isbn: str | None
    cover_url: str | None
    college: str | None
    program: str


def sheet_name_for(program: str | None) -> str:
    """A sheet name Excel accepts and the importer reads as this program.
    Blank, "Program name" and other names the importer would refuse or
    skip become "Uncategorised"."""
    name = _INVALID_SHEET_CHARS.sub("-", program or "")
    name = re.sub(r"\s+", " ", name).strip().strip("'")[:31].strip()
    if not name or name.lower() in _RESERVED_SHEET_NAMES:
        return UNCATEGORISED
    return name


def fetch_new_copies(admin, date_from: date, date_to: date, include_registered: bool = False) -> list[ExportRow]:
    """The copies to export, read-only. Excludes archived books."""
    start, end = manila_day_bounds(date_from, date_to)
    origins = ["assigned", "registered"] if include_registered else ["assigned"]

    copies = _fetch_all_rows(
        lambda: admin.table("book_copies")
        .select("id, book_id, accession_number, created_at, origin")
        .gte("created_at", utc_text(start))
        .lt("created_at", utc_text(end))
        .in_("origin", origins)
        .order("created_at")
        .order("id")
    )
    if not copies:
        return []

    book_ids = sorted({c["book_id"] for c in copies})
    books: dict[str, dict] = {}
    for i in range(0, len(book_ids), _BOOK_ID_CHUNK):
        chunk = book_ids[i:i + _BOOK_ID_CHUNK]
        for b in (
            admin.table("books")
            .select("id, title, subtitle, author, published_year, place_of_publication, publisher, call_number, "
                    "abstract, isbn, cover_url, subject, category, archived_at, created_at")
            .in_("id", chunk)
            .execute()
            .data
        ):
            books[b["id"]] = b

    rows: list[ExportRow] = []
    for c in copies:
        book = books.get(c["book_id"])
        if not book or book.get("archived_at"):
            continue
        title = book.get("title") or ""
        subtitle = (book.get("subtitle") or "").strip()
        if subtitle and subtitle.lower() not in title.lower():
            title = f"{title} : {subtitle}"
        book_created = parse_timestamp(book["created_at"]) if book.get("created_at") else None
        rows.append(ExportRow(
            accession_number=c["accession_number"],
            created_at=parse_timestamp(c["created_at"]).astimezone(MANILA),
            new_title=book_created is not None and start <= book_created < end,
            title=title,
            author=book.get("author"),
            published_year=book.get("published_year"),
            place_of_publication=book.get("place_of_publication"),
            publisher=book.get("publisher"),
            call_number=book.get("call_number"),
            abstract=book.get("abstract"),
            isbn=book.get("isbn"),
            cover_url=book.get("cover_url"),
            college=book.get("subject"),
            program=(book.get("category") or "").strip() or UNCATEGORISED,
        ))
    return rows


def _place_and_publisher(place: str | None, publisher: str | None) -> str | None:
    """'Manila : EDRIC Publishing House', as in the LRC sheets."""
    parts = [p.strip() for p in (place, publisher) if p and p.strip()]
    return " : ".join(parts) or None


def build_new_copies_workbook(rows: list[ExportRow]) -> bytes:
    by_sheet: dict[str, tuple[str, list[ExportRow]]] = {}
    for r in rows:
        name = sheet_name_for(r.program)
        # Excel sheet names ignore case, so "BSIT" and "bsit" share a sheet.
        by_sheet.setdefault(name.lower(), (name, []))[1].append(r)

    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    isbn_column = EXPORT_COLUMNS.index("ISBN") + 1
    for _, (name, sheet_rows) in sorted(by_sheet.items()):
        ws = wb.create_sheet(name)
        for col, header in enumerate(EXPORT_COLUMNS, start=1):
            put_cell(ws, 1, col, header)
        sheet_rows.sort(key=lambda r: (r.title.lower(), accession_sort_key(r.accession_number)))
        for row_no, r in enumerate(sheet_rows, start=2):
            values = {
                "Author(s)": None,  # the short form ("Martin, R.") isn't stored
                "Author(s) Full Name": r.author,
                "Year": r.published_year,
                "Title": r.title,
                "Place of Publication": _place_and_publisher(r.place_of_publication, r.publisher),
                "Call No.": r.call_number,
                "Book ID (Accession No.)": r.accession_number,
                "Description": r.abstract,
                "ISBN": r.isbn,
                "Images": r.cover_url,
                "College": r.college,
                "Program": r.program,
                "Date Added": r.created_at.date().isoformat(),
                "Added As": "New title" if r.new_title else "Additional copy",
            }
            for col, header in enumerate(EXPORT_COLUMNS, start=1):
                put_cell(ws, row_no, col, values[header])
            ws.cell(row=row_no, column=isbn_column).number_format = "@"
        ws.freeze_panes = "A2"
        for col, width in zip("ABCDEFGHIJKLMN", (14, 24, 7, 44, 32, 20, 22, 40, 16, 20, 12, 24, 12, 15)):
            ws.column_dimensions[col].width = width

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
