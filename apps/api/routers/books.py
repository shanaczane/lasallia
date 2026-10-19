import uuid
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from core.deps import get_optional_user, require_librarian
from core.embeddings import embed_single_book
from core.accession import normalize_accession_number
from core.loans import ensure_initial_copy, find_removal_blocker
from core.reservations import maybe_sweep_expired_reservations
from core.supabase import get_admin_client, get_client
from schemas.auth import UserProfile
from schemas.book import (
    LIBRARIAN_ONLY_FIELDS, AddCopiesRequest, Book, BookCopy, BookSearchResponse, BookUpdate, BookWrite, LibrarianBook,
)

router = APIRouter(prefix="/books", tags=["books"])

# The whole catalog is sent at once and filtered in the browser. Add
# pagination if it grows too big.
DEFAULT_LIMIT = 1000

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
    # Work out availability from the copies on every request; the stored
    # numbers on books are out of date. Books with no copies keep their
    # stored values.
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
    return books

@router.get("", response_model=BookSearchResponse)
def list_books(
    limit: int = DEFAULT_LIMIT,
    # Descriptions are most of the size and only some pages need them.
    include_abstract: bool = False,
    user: UserProfile | None = Depends(get_optional_user),
):
    db = get_client()
    maybe_sweep_expired_reservations(get_admin_client())
    # Archived books are hidden from every catalog view.
    def fetch_books():
        return db.table("books").select("*").is_("archived_at", "null").order("title").limit(limit).execute()

    def fetch_copies():
        return get_admin_client().table("book_copies").select("book_id, status").execute()

    # Copies are read with the admin client (they have no public RLS); only
    # counts and statuses are returned. Both reads run in parallel.
    with ThreadPoolExecutor(max_workers=2) as pool:
        books_future = pool.submit(fetch_books)
        copies_future = pool.submit(fetch_copies)
        books = books_future.result().data
        copies_data = copies_future.result().data
    if not include_abstract:
        for b in books:
            b.pop("abstract", None)
    books = _apply_real_availability(books, copies_data)
    books = _redact_for_patrons(books, user)

    return BookSearchResponse(books=books, total=len(books), page=1, per_page=limit)

def _check_accession_conflict(admin, accession_no: str | None, exclude_book_id: str | None = None) -> None:
    if not accession_no:
        return
    query = admin.table("books").select("id").eq("accession_no", accession_no)
    if exclude_book_id:
        query = query.neq("id", exclude_book_id)
    if query.execute().data:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f'Accession number "{accession_no}" is already in use by another book',
        )

# Add and edit books (librarians only). A new book gets one copy, from the
# accession number on the form. Copy counts come from the copies, so
# editing total_copies has no visible effect once copies exist.
@router.post("", response_model=LibrarianBook, status_code=status.HTTP_201_CREATED)
def create_book(body: BookWrite, librarian: UserProfile = Depends(require_librarian)):
    admin = get_admin_client()
    _check_accession_conflict(admin, body.accession_no)

    payload = body.model_dump()
    if payload.get("available_copies") is None:
        payload["available_copies"] = payload.get("total_copies")

    res = admin.table("books").insert(payload).execute()
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not create the book")
    embed_single_book(admin, res.data[0])
    ensure_initial_copy(admin, res.data[0]["id"])
    return res.data[0]

@router.patch("/{book_id}", response_model=LibrarianBook)
def update_book(book_id: str, body: BookUpdate, librarian: UserProfile = Depends(require_librarian)):
    admin = get_admin_client()
    existing = admin.table("books").select("id, accession_no").eq("id", book_id).execute()
    if not existing.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Book not found")
    old_accession = existing.data[0].get("accession_no")

    _check_accession_conflict(admin, body.accession_no, exclude_book_id=book_id)

    payload = body.model_dump()
    res = admin.table("books").update(payload).eq("id", book_id).execute()
    embed_single_book(admin, res.data[0])

    # Fixing the accession number on the form also fixes the copy's, or
    # the real label would never match at /borrow.
    if old_accession and body.accession_no and body.accession_no != old_accession:
        admin.table("book_copies").update(
            {"accession_number": normalize_accession_number(body.accession_no)}
        ).eq("book_id", book_id).eq("accession_number", normalize_accession_number(old_accession)).execute()
    ensure_initial_copy(admin, book_id)

    # Return availability worked out from the copies, like list_books.
    copies_res = admin.table("book_copies").select("book_id, status").eq("book_id", book_id).execute()
    book = _apply_real_availability(res.data, copies_res.data)
    return book[0]

@router.post("/{book_id}/add-copies", response_model=LibrarianBook)
def add_copies(book_id: str, body: AddCopiesRequest, librarian: UserProfile = Depends(require_librarian)):
    admin = get_admin_client()
    existing = admin.table("books").select("total_copies, available_copies").eq("id", book_id).execute()
    if not existing.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Book not found")
    book = existing.data[0]

    payload = {
        "total_copies": (book.get("total_copies") or 0) + body.count,
        "available_copies": (book.get("available_copies") or 0) + body.count,
    }
    res = admin.table("books").update(payload).eq("id", book_id).execute()

    copies_res = admin.table("book_copies").select("book_id, status").eq("book_id", book_id).execute()
    return _apply_real_availability(res.data, copies_res.data)[0]

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
        .order("accession_number")
        .execute()
    )
    copies = res.data

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
