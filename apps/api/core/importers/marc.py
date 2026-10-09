# apps/api/core/importers/marc.py
# Destiny catalog import. Reads a MARC 21 export from Follett Destiny and
# works out what it would change in books/book_copies, then (separately)
# applies that plan. One-way only: Destiny -> Lasallia, never back.
#
# Split in three so the matching rules are testable without a database:
#   parse_marc()  bytes -> ParsedRecord list        (pure)
#   plan_import() records + current rows -> plan    (pure)
#   apply_plan()  writes the plan through the admin client
#
# Ground rules, because an import writes into the same tables the kiosk,
# loans and holds read from:
#   - Never touches book_copies.status. Circulation state is owned by
#     Lasallia's own flows (and the status-machine trigger in 0004 would
#     reject most direct writes anyway).
#   - Never deletes. A copy Lasallia has but the export doesn't is only
#     reported (copies_not_in_export) for a librarian to look at.
#   - Only overwrites a field when the export actually has a value for it,
#     and never touches Lasallia-only fields (cover_url, category, subject,
#     collection_type, archived_at).
#
# Field mapping (MARC tag -> books column):
#   245 $a $b      -> title
#   100 $a (700)   -> author
#   020 $a         -> isbn
#   264/260 $b $c  -> publisher, published_year
#   520 $a         -> abstract
#   852            -> one per physical copy: $p barcode (= accession number),
#                     $h $i call number, $b collection (college), $c shelving
#                     location (program). Falls back to 090/082/050 for the
#                     call number when 852 has none.

import io
import re
from dataclasses import dataclass, field

from pymarc import MARCReader, Record

from core.accession import normalize_accession_number
from scripts.shelf_location import classify_call_number

# Fields compared on an existing book. Anything not listed here is never
# written by an update.
UPDATABLE_FIELDS = ("title", "author", "isbn", "call_number", "publisher", "published_year", "abstract")

BATCH_SIZE = 50


# ─── Parsing ──────────────────────────────────────────────────────────────

@dataclass
class ParsedRecord:
    index: int  # 1-based position in the file, for error messages
    title: str | None = None
    author: str | None = None
    isbn: str | None = None
    call_number: str | None = None
    publisher: str | None = None
    published_year: int | None = None
    abstract: str | None = None
    college: str | None = None
    program: str | None = None
    barcodes: list[str] = field(default_factory=list)
    # Only the spreadsheet importer sets these: where the record came from
    # ("Sheet BSIT, row 12") and a cover image URL for brand-new titles.
    location: str | None = None
    cover_url: str | None = None


@dataclass
class ImportIssue:
    record: int
    title: str | None
    message: str
    location: str | None = None


def _clean(value: str | None, trailing: str = " /:;,.") -> str | None:
    """Collapses whitespace and strips the ISBD punctuation MARC puts at the
    end of subfields ('Clean code :' -> 'Clean code')."""
    if not value:
        return None
    cleaned = re.sub(r"\s+", " ", value).strip().rstrip(trailing).strip()
    return cleaned or None


def normalize_isbn(value: str | None) -> str | None:
    """'978-0-13-235088-4 (pbk.)' -> '9780132350884'. Used on both sides of
    a comparison, so differently formatted copies of one ISBN still match."""
    if not value:
        return None
    token = value.strip().split(" ")[0]
    digits = re.sub(r"[^0-9Xx]", "", token).upper()
    return digits or None


def _first(record: Record, tags: tuple[str, ...], *codes: str) -> str | None:
    for tag in tags:
        for f in record.get_fields(tag):
            parts = [p for p in f.get_subfields(*codes) if p and p.strip()]
            if parts:
                return " ".join(parts)
    return None


def _parse_record(record: Record, index: int) -> ParsedRecord:
    parsed = ParsedRecord(index=index)
    parsed.title = _clean(_first(record, ("245",), "a", "b"))
    # Periods kept on names — "Martin, Robert C." ends in an initial, not
    # ISBD punctuation.
    parsed.author = _clean(_first(record, ("100", "700"), "a"), trailing=" ,;:/")
    isbn = _clean(_first(record, ("020",), "a"))
    parsed.isbn = isbn.split(" ")[0] if isbn else None  # drop "(pbk.)"-style qualifiers
    parsed.publisher = _clean(_first(record, ("264", "260"), "b"))
    parsed.abstract = _clean(_first(record, ("520",), "a"), trailing=" ")

    year_text = _first(record, ("264", "260"), "c")
    year_match = re.search(r"(?<!\d)(1[5-9]\d\d|20\d\d)(?!\d)", year_text or "")  # "c2008." too
    parsed.published_year = int(year_match.group(1)) if year_match else None

    holdings = record.get_fields("852")
    for f in holdings:
        for barcode in f.get_subfields("p"):
            normalized = normalize_accession_number(barcode)
            if normalized:
                parsed.barcodes.append(normalized)

    # Title-level values come from the first copy that has them — Destiny
    # repeats them on every 852 of the same title.
    for f in holdings:
        parsed.call_number = parsed.call_number or _clean(" ".join(f.get_subfields("h", "i")), trailing=" ")
        parsed.college = parsed.college or _clean(" ".join(f.get_subfields("b")))
        parsed.program = parsed.program or _clean(" ".join(f.get_subfields("c")))
    if not parsed.call_number:
        parsed.call_number = _clean(_first(record, ("090", "082", "050"), "a", "b"), trailing=" ")

    return parsed


def parse_marc(data: bytes) -> tuple[list[ParsedRecord], list[ImportIssue]]:
    records: list[ParsedRecord] = []
    issues: list[ImportIssue] = []
    reader = MARCReader(io.BytesIO(data), to_unicode=True, force_utf8=True, utf8_handling="replace")

    for index, record in enumerate(reader, start=1):
        if record is None:
            # pymarc yields None (rather than raising) for a record it
            # couldn't decode, and keeps going with the next one.
            issues.append(ImportIssue(index, None, f"Unreadable MARC record ({reader.current_exception})"))
            continue
        records.append(_parse_record(record, index))

    return records, issues


# ─── Planning ─────────────────────────────────────────────────────────────

@dataclass
class FieldChange:
    field: str
    old: str | int | None
    new: str | int | None


@dataclass
class PlannedBook:
    action: str  # "add" | "update" | "unchanged"
    record: int
    title: str
    author: str | None
    book_id: str | None = None
    matched_by: str | None = None  # "accession" | "isbn" | "title_author"
    archived: bool = False
    changes: list[FieldChange] = field(default_factory=list)
    new_copies: list[str] = field(default_factory=list)
    copies_not_in_export: list[str] = field(default_factory=list)
    # Exact payload apply_plan writes to books (insert for add, update for
    # update). Not sent to the client.
    payload: dict = field(default_factory=dict)
    shelf_location: str | None = None
    location: str | None = None


@dataclass
class ImportPlan:
    records_read: int
    items: list[PlannedBook]
    errors: list[ImportIssue]

    def count(self, action: str) -> int:
        return sum(1 for i in self.items if i.action == action)

    @property
    def copies_added(self) -> int:
        return sum(len(i.new_copies) for i in self.items)


def _title_author_key(title: str | None, author: str | None) -> str:
    return re.sub(r"[^a-z0-9]", "", f"{title or ''}|{author or ''}".lower())


def _same(field_name: str, old, new) -> bool:
    if field_name == "isbn":
        return normalize_isbn(old) == normalize_isbn(new)
    if isinstance(old, str) or isinstance(new, str):
        # Loose on trailing punctuation and on spacing before punctuation, so
        # "Martin, Robert C." vs "Martin, Robert C" or "Flint , Goodlett" vs
        # "Flint, Goodlett" (spreadsheet typing vs a librarian's cleanup)
        # aren't reported as edits.
        def loose(value) -> str | None:
            cleaned = _clean(str(value) if value is not None else None)
            return re.sub(r"\s+([,.;:])", r"\1", cleaned) if cleaned else None
        return loose(old) == loose(new)
    return old == new


def plan_import(
    records: list[ParsedRecord],
    existing_books: list[dict],
    existing_copies: list[dict],
    parse_issues: list[ImportIssue] | None = None,
) -> ImportPlan:
    """existing_books: rows with id, title, author, isbn, call_number,
    publisher, published_year, abstract, accession_no, archived_at.
    existing_copies: rows with book_id, accession_number."""
    errors = list(parse_issues or [])
    books_by_id = {b["id"]: b for b in existing_books}

    # How an export record finds the book it belongs to, strongest first:
    # a copy barcode Lasallia already has, then ISBN, then title + author.
    book_by_barcode: dict[str, str] = {}
    copies_by_book: dict[str, list[str]] = {}
    for c in existing_copies:
        acc = normalize_accession_number(c["accession_number"])
        book_by_barcode[acc] = c["book_id"]
        copies_by_book.setdefault(c["book_id"], []).append(acc)
    for b in existing_books:
        # Seeded books whose book_copies row was never backfilled still
        # carry their one accession number on books itself.
        if b.get("accession_no"):
            book_by_barcode.setdefault(normalize_accession_number(b["accession_no"]), b["id"])

    # An ISBN or title/author shared by more than one book is ambiguous —
    # left out rather than guessing which of them the export means.
    def unique_index(key_fn) -> dict[str, str]:
        seen: dict[str, str | None] = {}
        for b in existing_books:
            key = key_fn(b)
            if key:
                seen[key] = None if key in seen else b["id"]
        return {k: v for k, v in seen.items() if v}

    book_by_isbn = unique_index(lambda b: normalize_isbn(b.get("isbn")))
    book_by_title_author = unique_index(lambda b: _title_author_key(b.get("title"), b.get("author")))

    items: list[PlannedBook] = []
    barcodes_in_file: dict[str, int] = {}
    matched_records: dict[str, int] = {}

    for rec in records:
        if not rec.title:
            errors.append(ImportIssue(rec.index, None, "Missing title (MARC 245 $a)", rec.location))
            continue

        barcodes = []
        for code in rec.barcodes:
            if code in barcodes_in_file:
                errors.append(ImportIssue(rec.index, rec.title, f"Barcode {code} also appears in record {barcodes_in_file[code]} — skipped here", rec.location))
                continue
            barcodes_in_file[code] = rec.index
            barcodes.append(code)
        if not barcodes:
            errors.append(ImportIssue(rec.index, rec.title, "No copy barcode (MARC 852 $p)", rec.location))
            continue

        owners = {book_by_barcode[c] for c in barcodes if c in book_by_barcode}
        if len(owners) > 1:
            errors.append(ImportIssue(rec.index, rec.title, "Its copy barcodes belong to different books in Lasallia — fix the file or merge those books first", rec.location))
            continue

        book_id, matched_by = None, None
        if owners:
            book_id, matched_by = owners.pop(), "accession"
        elif normalize_isbn(rec.isbn) in book_by_isbn:
            book_id, matched_by = book_by_isbn[normalize_isbn(rec.isbn)], "isbn"
        elif _title_author_key(rec.title, rec.author) in book_by_title_author:
            book_id, matched_by = book_by_title_author[_title_author_key(rec.title, rec.author)], "title_author"

        if book_id and book_id in matched_records:
            errors.append(ImportIssue(rec.index, rec.title, f"Matches the same Lasallia book as record {matched_records[book_id]} — skipped", rec.location))
            continue

        # A barcode is new unless it's already a book_copies row. Matching it
        # through books.accession_no alone still needs the copy row created.
        new_copies = [c for c in barcodes if c not in book_by_barcode or (book_id and c not in copies_by_book.get(book_id, []))]
        shelf = classify_call_number(rec.call_number)

        if book_id is None:
            items.append(PlannedBook(
                action="add",
                record=rec.index,
                title=rec.title,
                author=rec.author,
                location=rec.location,
                new_copies=barcodes,
                shelf_location=shelf["shelf_location"],
                payload={
                    "accession_no": barcodes[0],
                    "title": rec.title,
                    "author": rec.author or "Unknown",
                    "isbn": rec.isbn,
                    "call_number": rec.call_number or "",
                    # Destiny has no notion of Lasallia's program/college
                    # split; the export's 852 $c / $b carry it when the
                    # library fills them in.
                    "category": rec.program or "Uncategorized",
                    "subject": rec.college,
                    "shelf_location": shelf["shelf_location"],
                    "aisle": shelf["aisle"],
                    "status": "available",
                    "abstract": rec.abstract,
                    "published_year": rec.published_year,
                    "publisher": rec.publisher,
                    "format": "print",
                    # Same default seed_books.py gives every seeded title.
                    "floor": "Floor 2",
                    "cover_url": rec.cover_url,
                    "total_copies": len(barcodes),
                    "available_copies": len(barcodes),
                },
            ))
            continue

        matched_records[book_id] = rec.index
        current = books_by_id[book_id]
        incoming = {
            "title": rec.title,
            "author": rec.author,
            "isbn": rec.isbn,
            "call_number": rec.call_number,
            "publisher": rec.publisher,
            "published_year": rec.published_year,
            "abstract": rec.abstract,
        }
        changes = [
            FieldChange(name, current.get(name), value)
            for name, value in incoming.items()
            if value not in (None, "") and not _same(name, current.get(name), value)
        ]
        payload = {c.field: c.new for c in changes}
        if "call_number" in payload:
            payload["shelf_location"] = shelf["shelf_location"]
            payload["aisle"] = shelf["aisle"]

        items.append(PlannedBook(
            action="update" if changes or new_copies else "unchanged",
            record=rec.index,
            location=rec.location,
            title=current["title"],
            author=current.get("author"),
            book_id=book_id,
            matched_by=matched_by,
            archived=bool(current.get("archived_at")),
            changes=changes,
            new_copies=new_copies,
            copies_not_in_export=sorted(set(copies_by_book.get(book_id, [])) - set(barcodes)),
            payload=payload,
            shelf_location=current.get("shelf_location") if "call_number" not in payload else shelf["shelf_location"],
        ))

    return ImportPlan(records_read=len(records) + len(parse_issues or []), items=items, errors=errors)


# ─── Applying ─────────────────────────────────────────────────────────────

def apply_plan(admin, plan: ImportPlan, synced_at: str) -> list[ImportIssue]:
    """Writes the plan. PostgREST has no multi-statement transaction, so
    each book is applied on its own — one failing row is reported and the
    rest still go through. Re-running the same file afterwards is safe:
    whatever already landed comes back as unchanged."""
    failures: list[ImportIssue] = []

    def copy_rows(book_id: str, item: PlannedBook) -> list[dict]:
        return [
            {"book_id": book_id, "accession_number": code, "status": "available", "shelf_location": item.shelf_location}
            for code in item.new_copies
        ]

    adds = [i for i in plan.items if i.action == "add"]
    for start in range(0, len(adds), BATCH_SIZE):
        batch = adds[start:start + BATCH_SIZE]
        try:
            inserted = admin.table("books").insert([{**i.payload, "last_synced_at": synced_at} for i in batch]).execute().data
            id_by_accession = {row["accession_no"]: row["id"] for row in inserted}
            copies = [row for i in batch for row in copy_rows(id_by_accession[i.payload["accession_no"]], i)]
            admin.table("book_copies").insert(copies).execute()
            for i in batch:
                i.book_id = id_by_accession[i.payload["accession_no"]]
        except Exception as e:
            failures.extend(ImportIssue(i.record, i.title, f"Could not add: {e}", i.location) for i in batch)

    # Unchanged books are deliberately not written at all — even bumping
    # last_synced_at would bump updated_at and send every one of them back
    # through re-embedding (core/embeddings.py's reembed_books).
    for item in (i for i in plan.items if i.action == "update"):
        try:
            admin.table("books").update({**item.payload, "last_synced_at": synced_at}).eq("id", item.book_id).execute()
            if item.new_copies:
                admin.table("book_copies").insert(copy_rows(item.book_id, item)).execute()
        except Exception as e:
            failures.append(ImportIssue(item.record, item.title, f"Could not update: {e}", item.location))

    return failures
