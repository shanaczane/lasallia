import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Callable, NoReturn, TypeVar

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from postgrest.exceptions import APIError

from core.accession import (
    accession_counters, accession_in_use, accession_sort_key, clean_accession_input, normalize_accession_number,
)
from core.deps import get_optional_user, require_librarian
from core.embeddings import embed_single_book
from core.importers.marc import LARGE_JUMP, large_jump
from core.isbn import clean_isbn_input, normalize_isbn
from core.loans import find_removal_blocker
from core.reservations import maybe_sweep_expired_reservations
from core.rows import fetch_all_rows
from core.supabase import get_admin_client, get_client
from schemas.auth import UserProfile
from schemas.book import (
    LIBRARIAN_ONLY_FIELDS, AccessionCorrection, AddCopiesRequest, Book, BookCopy, BookCreate, BookSearchResponse,
    BookUpdate, BookWithNewCopies, CorrectAccessionRequest, LibrarianBook, RegisterCopyRequest,
)

T = TypeVar("T")

router = APIRouter(prefix="/books", tags=["books"])

# The whole catalog is sent at once and filtered in the browser. Add
# pagination if it grows too big.
DEFAULT_LIMIT: int | None = None  # every book

def _redact_for_patrons(books: list[dict], user: UserProfile | None) -> list[dict]:
    # Removed here on the server for everyone except librarians:
    #  - accession number: never shown before the student types it.
    #  - acquisition details (price, vendor, funding, notes): internal data.
    if user is not None and user.role == "librarian":
        return books
    for b in books:
        b["accession_no"] = None
        for field in LIBRARIAN_ONLY_FIELDS:
            b[field] = None
    return books

def _derive_status(statuses: set[str], has_waiting: bool = False) -> str:
    if "available" in statuses:
        return "available"
    if "reserved" in statuses:
        return "reserved"
    # Waiting to be reshelved. If someone has it reserved it goes to them, so
    # it stays "borrowed" for everyone else.
    if "for_reshelving" in statuses and not has_waiting:
        return "for_reshelving"
    if statuses and statuses <= {"lost", "missing", "damaged"}:
        return "missing"
    # On the wrong shelf, not on loan, so not "borrowed".
    if "misplaced" in statuses and statuses <= {"misplaced", "lost", "missing", "damaged"}:
        return "misplaced"
    return "borrowed"

def _apply_real_availability(books: list[dict], copy_rows: list[dict]) -> list[dict]:
    # Copy counts and availability always come from book_copies; the
    # total_copies/available_copies columns on books are no longer kept up
    # to date. A book with no copies has zero of everything and keeps its
    # stored status.
    agg: dict[str, dict] = {}
    for row in copy_rows:
        entry = agg.setdefault(row["book_id"], {"total": 0, "available": 0, "reserved": 0, "statuses": set()})
        entry["total"] += 1
        entry["statuses"].add(row["status"])
        if row["status"] == "available":
            entry["available"] += 1
        elif row["status"] == "reserved":
            entry["reserved"] += 1

    # Only books that would otherwise read "for reshelving" need the
    # reservation check, so the extra query is skipped when there are none.
    reshelving_ids = [
        book_id for book_id, e in agg.items()
        if "for_reshelving" in e["statuses"] and not e["statuses"] & {"available", "reserved"}
    ]
    waiting_ids: set[str] = set()
    if reshelving_ids:
        waiting_ids = {
            r["book_id"] for r in
            get_admin_client().table("reservations").select("book_id")
            .in_("book_id", reshelving_ids).in_("status", ["pending", "ready"]).execute().data
        }

    for b in books:
        entry = agg.get(b["id"])
        if entry:
            b["total_copies"] = entry["total"]
            b["available_copies"] = entry["available"]
            b["reserved_copies"] = entry["reserved"]
            b["status"] = _derive_status(entry["statuses"], has_waiting=b["id"] in waiting_ids)
        else:
            b["total_copies"] = 0
            b["available_copies"] = 0
            b["reserved_copies"] = 0
    return books

@router.get("", response_model=BookSearchResponse)
def list_books(
    limit: int | None = DEFAULT_LIMIT,
    # Descriptions are most of the size and only some pages need them.
    include_abstract: bool = False,
    user: UserProfile | None = Depends(get_optional_user),
):
    db = get_client()
    maybe_sweep_expired_reservations(get_admin_client())
    # Archived books are hidden from every catalog view.
    # Both read page by page: a single read stops at 1,000 rows, which
    # would undercount copies everywhere the catalog is shown.
    def fetch_books():
        rows = fetch_all_rows(
            lambda: db.table("books").select("*").is_("archived_at", "null").order("title").order("id"))
        return rows[:limit] if limit else rows

    def fetch_copies():
        return fetch_all_rows(lambda: get_admin_client().table("book_copies").select("book_id, status").order("id"))

    # Copies are read with the admin client (they have no public RLS); only
    # counts and statuses are returned. Both reads run in parallel.
    with ThreadPoolExecutor(max_workers=2) as pool:
        books_future = pool.submit(fetch_books)
        copies_future = pool.submit(fetch_copies)
        books = books_future.result()
        copies_data = copies_future.result()
    if not include_abstract:
        for b in books:
            b.pop("abstract", None)
    books = _apply_real_availability(books, copies_data)
    books = _redact_for_patrons(books, user)

    return BookSearchResponse(books=books, total=len(books), page=1, per_page=limit or len(books))

# ─── Adding and editing books (librarians only) ──────────────────────────

# Postgres error codes the accession functions in migrations/0058 raise.
_DB_ERROR_STATUS = {
    "22023": status.HTTP_400_BAD_REQUEST,   # bad input: count, prefix, format, reason
    "P0002": status.HTTP_404_NOT_FOUND,     # book or copy not found
    "23505": status.HTTP_409_CONFLICT,      # number already in use
    "23514": status.HTTP_409_CONFLICT,      # direct accession edit blocked
}


def _raise_db_error(e: APIError) -> NoReturn:
    code = getattr(e, "code", None)
    if code == "23505":
        raise HTTPException(status.HTTP_409_CONFLICT, "That accession number is already in use by another copy.")
    if code in _DB_ERROR_STATUS:
        raise HTTPException(_DB_ERROR_STATUS[code], e.message)
    raise e


def _assign_numbers(call: Callable[[], T]) -> T:
    """Runs a call that assigns accession numbers. The counter skips every
    number in use, so a unique violation only happens when a copy with the
    next number was registered at the same moment; one retry gets past it.
    The database function rolls back fully on failure, so retrying is safe."""
    try:
        try:
            return call()
        except APIError as e:
            if getattr(e, "code", None) != "23505":
                raise
        return call()
    except APIError as e:
        _raise_db_error(e)


def _title_author_key(title: str | None, author: str | None) -> str:
    return re.sub(r"[^a-z0-9]", "", f"{title or ''}|{author or ''}".lower())


def _duplicate(code: str, message: str, book: dict) -> HTTPException:
    # Librarian-only endpoints, but the matched book is still described by
    # title and author only, never its accession numbers.
    return HTTPException(status.HTTP_409_CONFLICT, {
        "code": code,
        "message": message,
        "book": {
            "id": book["id"],
            "title": book["title"],
            "author": book.get("author"),
            "archived": bool(book.get("archived_at")),
        },
    })


def _check_isbn_duplicate(admin, isbn: str, exclude_book_id: str | None = None) -> None:
    rows = admin.table("books").select("id, title, author, isbn, archived_at").not_.is_("isbn", "null").execute().data
    for b in rows:
        if b["id"] != exclude_book_id and normalize_isbn(b["isbn"]) == isbn:
            where = " (archived)" if b.get("archived_at") else ""
            raise _duplicate(
                "duplicate_isbn",
                f'ISBN {isbn} is already cataloged as "{b["title"]}"{where}. Add copies to that book instead.',
                b,
            )


def _check_title_duplicate(admin, title: str, author: str) -> None:
    key = _title_author_key(title, author)
    rows = admin.table("books").select("id, title, author, archived_at").execute().data
    for b in rows:
        if _title_author_key(b["title"], b.get("author")) == key:
            raise _duplicate(
                "possible_duplicate",
                f'"{b["title"]}" by {b.get("author") or "the same author"} is already cataloged, and this book '
                "has no ISBN to tell them apart. Add copies to it, or save this as a separate book.",
                b,
            )


def _check_large_jump(admin, accession: str, confirmed: bool) -> None:
    if confirmed:
        return
    next_value = large_jump(accession, accession_counters(admin))
    if next_value:
        raise HTTPException(status.HTTP_409_CONFLICT, {
            "code": "large_jump",
            "message": (
                f"{accession} is more than {LARGE_JUMP:,} above the next accession number ({next_value}). "
                "Saving it moves the counter past it for good, so check the label before confirming."
            ),
            "next_value": next_value,
        })


def _book_with_counts(admin, book: dict) -> dict:
    copies = admin.table("book_copies").select("book_id, status").eq("book_id", book["id"]).execute().data
    return _apply_real_availability([book], copies)[0]


def _reject_accession_field(sent: str | None, current: str | None) -> None:
    # An older form still sends accession_no; an unchanged value is ignored.
    if not sent or not sent.strip():
        return
    if current and normalize_accession_number(sent).upper() == normalize_accession_number(current).upper():
        return
    raise HTTPException(
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "Accession numbers aren't set on the book form. New copies get one automatically; use Register "
        "existing copy for a number already printed on a book, or Correct number to fix a copy's number.",
    )


# A new book and its copies are saved in one transaction, and the copies get
# the next numbers from the accession counter.
@router.post("", response_model=BookWithNewCopies, status_code=status.HTTP_201_CREATED)
def create_book(body: BookCreate, librarian: UserProfile = Depends(require_librarian)):
    _reject_accession_field(body.accession_no, None)
    try:
        isbn = clean_isbn_input(body.isbn)
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e))

    admin = get_admin_client()
    if isbn:
        _check_isbn_duplicate(admin, isbn)
    elif not body.confirm_possible_duplicate:
        _check_title_duplicate(admin, body.title, body.author)

    # Columns left out keep their database defaults (e.g. collection_type).
    fields = body.model_dump(
        exclude={"accession_no", "copy_count", "prefix", "confirm_possible_duplicate", "isbn"},
        exclude_none=True,
    )
    if isbn:
        fields["isbn"] = isbn

    result = _assign_numbers(lambda: admin.rpc("create_book_with_copies", {
        "p_book": fields,
        "p_prefix": body.prefix.upper(),
        "p_count": body.copy_count,
    }).execute().data)

    book = result["book"]
    # After the transaction, like every other save: a failure here never
    # undoes the book, and reembed_books catches anything it missed.
    embed_single_book(admin, book)
    return {**_book_with_counts(admin, book), "assigned_accession_numbers": result["accession_numbers"]}


@router.patch("/{book_id}", response_model=LibrarianBook)
def update_book(book_id: str, body: BookUpdate, librarian: UserProfile = Depends(require_librarian)):
    admin = get_admin_client()
    existing = admin.table("books").select("id, accession_no, isbn").eq("id", book_id).execute()
    if not existing.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Book not found")
    current = existing.data[0]
    _reject_accession_field(body.accession_no, current.get("accession_no"))

    payload = body.model_dump(exclude={"accession_no"})

    # An unchanged ISBN keeps the value as it was stored (existing values
    # aren't rewritten), so a book that already shares an ISBN or has an
    # invalid one can still be edited.
    if normalize_isbn(body.isbn) == normalize_isbn(current.get("isbn")):
        payload["isbn"] = current.get("isbn")
    else:
        try:
            payload["isbn"] = clean_isbn_input(body.isbn)
        except ValueError as e:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e))
        if payload["isbn"]:
            _check_isbn_duplicate(admin, payload["isbn"], exclude_book_id=book_id)

    res = admin.table("books").update(payload).eq("id", book_id).execute()
    embed_single_book(admin, res.data[0])
    return _book_with_counts(admin, res.data[0])


# New copies of a book already in the catalog, numbered from the counter.
@router.post("/{book_id}/add-copies", response_model=BookWithNewCopies)
def add_copies(book_id: str, body: AddCopiesRequest, librarian: UserProfile = Depends(require_librarian)):
    admin = get_admin_client()
    numbers = _assign_numbers(lambda: admin.rpc("add_book_copies", {
        "p_book_id": book_id,
        "p_prefix": body.prefix.upper(),
        "p_count": body.count,
    }).execute().data)

    book = admin.table("books").select("*").eq("id", book_id).execute().data[0]
    return {**_book_with_counts(admin, book), "assigned_accession_numbers": numbers}


# A copy whose number is already printed on it (cataloged before Lasallia
# assigned numbers). Moves the counter past it if needed.
@router.post("/{book_id}/copies/register", response_model=BookCopy, status_code=status.HTTP_201_CREATED)
def register_existing_copy(book_id: str, body: RegisterCopyRequest, librarian: UserProfile = Depends(require_librarian)):
    try:
        accession = clean_accession_input(body.accession_number)
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e))

    admin = get_admin_client()
    book_res = admin.table("books").select("id, shelf_location, archived_at").eq("id", book_id).execute()
    if not book_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Book not found")
    book = book_res.data[0]
    if book.get("archived_at"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This book is archived. Restore it before adding copies.")

    if accession_in_use(admin, accession):
        raise HTTPException(status.HTTP_409_CONFLICT, f"{accession} is already in use by another copy.")
    _check_large_jump(admin, accession, body.confirm_large_jump)

    try:
        row = admin.table("book_copies").insert({
            "book_id": book_id,
            "accession_number": accession,
            "status": "available",
            "shelf_location": book.get("shelf_location"),
            # Already had a printed number, so "Export new books" leaves it
            # out unless asked.
            "origin": "registered",
        }).execute().data[0]
    except APIError as e:
        _raise_db_error(e)
    return {k: row.get(k) for k in ("id", "accession_number", "status", "shelf_location")}


# The only way to change a copy's number once saved. Needs a reason; the old
# and new values, reason, who and when are kept in accession_corrections.
@router.post("/copies/{copy_id}/correct-accession", response_model=AccessionCorrection)
def correct_accession(copy_id: str, body: CorrectAccessionRequest, librarian: UserProfile = Depends(require_librarian)):
    reason = body.reason.strip()
    if not reason:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Give a reason for the correction.")
    try:
        accession = clean_accession_input(body.new_accession)
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e))

    admin = get_admin_client()
    _check_large_jump(admin, accession, body.confirm_large_jump)
    try:
        row = admin.rpc("correct_accession_number", {
            "p_copy_id": copy_id,
            "p_new": accession,
            "p_reason": reason,
            "p_staff": librarian.id,
        }).execute().data
    except APIError as e:
        _raise_db_error(e)
    return {**row, "corrected_by_name": librarian.full_name}


@router.get("/{book_id}/accession-corrections", response_model=list[AccessionCorrection])
def list_accession_corrections(book_id: str, librarian: UserProfile = Depends(require_librarian)):
    admin = get_admin_client()
    rows = (
        admin.table("accession_corrections")
        .select("id, book_copy_id, old_value, new_value, reason, corrected_by, corrected_at")
        .eq("book_id", book_id)
        .order("corrected_at", desc=True)
        .execute()
    ).data
    staff_ids = list({r["corrected_by"] for r in rows if r.get("corrected_by")})
    names = {}
    if staff_ids:
        names = {
            p["id"]: p.get("full_name")
            for p in admin.table("profiles").select("id, full_name").in_("id", staff_ids).execute().data
        }
    return [{**r, "corrected_by_name": names.get(r.get("corrected_by"))} for r in rows]

@router.delete("/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_book(book_id: str, librarian: UserProfile = Depends(require_librarian)):
    admin = get_admin_client()
    book_res = admin.table("books").select("id, title").eq("id", book_id).execute()
    if not book_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Book not found")
    title = book_res.data[0]["title"]

    blocker = find_removal_blocker(admin, book_id)
    if blocker:
        raise HTTPException(status.HTTP_409_CONFLICT, f'"{title}" cannot be deleted — it {blocker}.')

    try:
        admin.table("book_copies").delete().eq("book_id", book_id).execute()
        admin.table("books").delete().eq("id", book_id).execute()
    except Exception:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f'"{title}" has related records and can\'t be deleted — try archiving it instead.',
        )

@router.get("/{book_id}", response_model=LibrarianBook)
def get_book(book_id: str, user: UserProfile | None = Depends(get_optional_user)):
    db = get_client()
    admin = get_admin_client()
    # Expire overdue pickups first, so copy statuses are current.
    maybe_sweep_expired_reservations(admin)
    # Fetch the book and its copies in parallel.
    with ThreadPoolExecutor(max_workers=2) as pool:
        res_future = pool.submit(lambda: db.table("books").select("*").eq("id", book_id).execute())
        copies_future = pool.submit(
            lambda: admin.table("book_copies").select("id, book_id, status").eq("book_id", book_id).execute()
        )
        res = res_future.result()
        copies_res = copies_future.result()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Book not found")

    # Only librarians can open an archived book (e.g. to restore it). Others
    # get a plain 404.
    if res.data[0].get("archived_at") and (user is None or user.role != "librarian"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Book not found")

    book = _apply_real_availability(res.data, copies_res.data)

    # Expected-back date and waiting count, only when no copy is available.
    # Detail page only, to keep the list fast.
    if not book[0].get("available_copies"):
        copy_ids = [c["id"] for c in copies_res.data]
        if copy_ids:
            soonest = (
                admin.table("loans")
                .select("due_date")
                .in_("book_copy_id", copy_ids)
                .in_("status", ["active", "overdue"])
                .order("due_date")
                .limit(1)
                .execute()
            )
            if soonest.data:
                book[0]["expected_back"] = soonest.data[0]["due_date"]

        waiting_res = (
            admin.table("reservations")
            .select("id", count="exact")
            .eq("book_id", book_id)
            .in_("status", ["pending", "ready"])
            .execute()
        )
        book[0]["waiting_count"] = waiting_res.count or 0

    book = _redact_for_patrons(book, user)

    return book[0]

# "You may also like" on the book page: the most similar books by content.
@router.get("/{book_id}/similar", response_model=list[Book])
def get_similar_books(book_id: str, limit: int = 5, user: UserProfile | None = Depends(get_optional_user)):
    admin = get_admin_client()

    # Admin client: book_similarities has no public RLS.
    neighbor_rows = (
        admin.table("book_similarities")
        .select("neighbor_book_id, rank")
        .eq("book_id", book_id)
        .order("rank")
        .limit(limit)
        .execute()
    ).data
    if not neighbor_rows:
        return []

    neighbor_ids = [r["neighbor_book_id"] for r in neighbor_rows]
    with ThreadPoolExecutor(max_workers=2) as pool:
        books_future = pool.submit(
            lambda: admin.table("books").select("*").in_("id", neighbor_ids).is_("archived_at", "null").execute()
        )
        copies_future = pool.submit(
            lambda: admin.table("book_copies").select("book_id, status").in_("book_id", neighbor_ids).execute()
        )
        books_by_id = {b["id"]: b for b in books_future.result().data}
        copies_data = copies_future.result().data

    # Keep the similarity order and drop archived books.
    ordered = [books_by_id[nid] for nid in neighbor_ids if nid in books_by_id]
    ordered = _apply_real_availability(ordered, copies_data)
    ordered = _redact_for_patrons(ordered, user)
    return ordered


@router.get("/{book_id}/copies", response_model=list[BookCopy])
def list_book_copies(book_id: str, librarian: UserProfile = Depends(require_librarian)):
    admin = get_admin_client()
    res = (
        admin.table("book_copies")
        .select("id, accession_number, status, shelf_location")
        .eq("book_id", book_id)
        .execute()
    )
    # Numeric order within a prefix: T9 before T10.
    copies = sorted(res.data, key=lambda c: accession_sort_key(c["accession_number"]))

    # Add the borrower and due date for copies that are out on loan.
    on_loan_ids = [c["id"] for c in copies if c["status"] in ("on_loan", "overdue")]
    if on_loan_ids:
        loans = (
            admin.table("loans")
            .select("book_copy_id, student_id, due_date")
            .in_("book_copy_id", on_loan_ids)
            .in_("status", ["active", "overdue"])
            .execute()
        ).data
        student_ids = [loan["student_id"] for loan in loans]
        profiles = (
            admin.table("profiles").select("id, full_name").in_("id", student_ids).execute().data
            if student_ids else []
        )
        names_by_id = {p["id"]: p["full_name"] for p in profiles}
        loan_by_copy_id = {loan["book_copy_id"]: loan for loan in loans}

        for copy in copies:
            loan = loan_by_copy_id.get(copy["id"])
            if loan:
                copy["borrower_name"] = names_by_id.get(loan["student_id"])
                copy["due_date"] = loan["due_date"]

    return copies

# Marks a lost/missing/damaged/misplaced copy as found. It goes to the
# reshelving queue; the reshelving scan makes it available.
@router.post("/copies/{copy_id}/mark-found", status_code=status.HTTP_204_NO_CONTENT)
def mark_copy_found(copy_id: str, librarian: UserProfile = Depends(require_librarian)):
    admin = get_admin_client()
    copy_res = admin.table("book_copies").select("id, status").eq("id", copy_id).execute()
    if not copy_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Copy not found")
    copy = copy_res.data[0]
    if copy["status"] not in ("missing", "lost", "damaged", "misplaced"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"This copy is currently '{copy['status']}', not missing/lost/damaged/misplaced",
        )
    admin.table("book_copies").update({"status": "for_reshelving"}).eq("id", copy_id).execute()


COVER_BUCKET = "book-covers"
MAX_COVER_BYTES = 5 * 1024 * 1024


# File type from the file's first bytes, not the browser's claim.
def _sniff_image_type(data: bytes) -> tuple[str, str] | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", "jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp", "webp"
    return None


# Uploads a book cover. Size and type limits are enforced here. Each upload
# gets a new file name so browsers don't show an old cached cover.
@router.post("/{book_id}/cover")
def upload_book_cover(
    book_id: str,
    file: UploadFile = File(...),
    librarian: UserProfile = Depends(require_librarian),
):
    admin = get_admin_client()
    book_res = admin.table("books").select("id, cover_url").eq("id", book_id).execute()
    if not book_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Book not found")

    data = file.file.read(MAX_COVER_BYTES + 1)
    if len(data) > MAX_COVER_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Cover image must be 5 MB or smaller")
    sniffed = _sniff_image_type(data)
    if not sniffed:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cover must be a JPG, PNG, or WebP image")
    content_type, ext = sniffed

    path = f"{book_id}/{uuid.uuid4().hex}.{ext}"
    bucket = admin.storage.from_(COVER_BUCKET)
    bucket.upload(path, data, {"content-type": content_type})
    cover_url = bucket.get_public_url(path)

    admin.table("books").update({"cover_url": cover_url}).eq("id", book_id).execute()

    # Best-effort tidy-up of the cover this replaced (only if it lives in our bucket).
    old = book_res.data[0].get("cover_url")
    marker = f"/{COVER_BUCKET}/"
    if old and marker in old:
        try:
            bucket.remove([old.split(marker, 1)[1].split("?")[0]])
        except Exception as e:
            print(f"upload_book_cover: could not remove old cover for {book_id}: {e}")

    return {"cover_url": cover_url}
