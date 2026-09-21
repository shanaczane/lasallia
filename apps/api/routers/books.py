import uuid
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from core.deps import get_optional_user, require_librarian
from core.supabase import get_admin_client, get_client
from schemas.auth import UserProfile
from schemas.book import Book, BookCopy, BookSearchResponse, BookUpdate, BookWrite

router = APIRouter(prefix="/books", tags=["books"])

# Only 185 rows today (Sprint 6.3 scale) — one full fetch, client-side
# search/filter/sort. Revisit with real pagination once the catalog grows
# past what's reasonable to ship in one response.
DEFAULT_LIMIT = 1000

def _redact_accession(books: list[dict], user: UserProfile | None) -> list[dict]:
    # Core rule of the borrow/return kiosk plan: the accession number is
    # never displayed to a student before they've typed it themselves —
    # not on the catalog, not on the detail page. Checked here, at the
    # response layer, not trusted to the frontend not to render it: any
    # caller without a librarian JWT gets it nulled out, whether they're
    # a guest, a student, or someone poking the API directly.
    if user is not None and user.role == "librarian":
        return books
    for b in books:
        b["accession_no"] = None
    return books

def _derive_status(statuses: set[str]) -> str:
    if "available" in statuses:
        return "available"
    if "reserved" in statuses:
        return "reserved"
    if statuses and statuses <= {"lost", "missing", "damaged"}:
        return "misplaced"
    return "borrowed"

def _apply_real_availability(books: list[dict], copy_rows: list[dict]) -> list[dict]:
    # The Phase 2 kiosk plan tracks availability per physical copy in
    # book_copies now, not as a stored integer on books — that integer
    # (and books.status) went stale the moment the first real loan/hold
    # started mutating book_copies instead. Recompute both from the real
    # rows on every response so the catalog can't lie about what's on the
    # shelf. Books with no book_copies rows yet (e.g. added through the
    # not-yet-built librarian write endpoints) fall back to their own
    # stored fields rather than showing zero copies of everything.
    agg: dict[str, dict] = {}
    for row in copy_rows:
        entry = agg.setdefault(row["book_id"], {"total": 0, "available": 0, "reserved": 0, "statuses": set()})
        entry["total"] += 1
        entry["statuses"].add(row["status"])
        if row["status"] == "available":
            entry["available"] += 1
        elif row["status"] == "reserved":
            entry["reserved"] += 1

    for b in books:
        entry = agg.get(b["id"])
        if entry:
            b["total_copies"] = entry["total"]
            b["available_copies"] = entry["available"]
            b["reserved_copies"] = entry["reserved"]
            b["status"] = _derive_status(entry["statuses"])
    return books

@router.get("", response_model=BookSearchResponse)
def list_books(
    limit: int = DEFAULT_LIMIT,
    # The abstract is ~80% of this response by size and only the detail page
    # (GET /books/{id}) and the librarian edit form use it. Off by default.
    include_abstract: bool = False,
    user: UserProfile | None = Depends(get_optional_user),
):
    db = get_client()
    # Reports plan Phase 2: an archived book is meant to disappear from
    # every catalog view (student, guest, kiosk, librarian alike) — this
    # is the one query every one of those surfaces shares.
    def fetch_books():
        return db.table("books").select("*").is_("archived_at", "null").order("title").limit(limit).execute()

    def fetch_copies():
        return get_admin_client().table("book_copies").select("book_id, status").execute()

    # book_copies has no public RLS policy (its only legitimate public-ish
    # access path is the token-authorized holds/loans flow) — the backend
    # itself is trusted to read it, same as it already is for redacting
    # accession_no below. Only the safe aggregate (counts/derived status)
    # ever leaves this function, never individual copy rows.
    #
    # Small dataset (~185 rows) — one unfiltered fetch is simpler and just
    # as cheap as filtering by the ids already on the page.
    #
    # The two reads don't depend on each other, so they run side by side
    # instead of paying the database latency twice.
    with ThreadPoolExecutor(max_workers=2) as pool:
        books_future = pool.submit(fetch_books)
        copies_future = pool.submit(fetch_copies)
        books = books_future.result().data
        copies_data = copies_future.result().data
    if not include_abstract:
        for b in books:
            b.pop("abstract", None)
    books = _apply_real_availability(books, copies_data)
    books = _redact_accession(books, user)

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

# Librarian-only catalog write endpoints (BookFormModal's Add/Edit form).
# Deliberately don't touch book_copies here — a freshly added book has no
# physical copies yet, and _apply_real_availability already falls back to
# these plain columns until copies exist for it (see its docstring above).
# Editing total_copies on a book that DOES have book_copies rows won't move
# the number shown anywhere, since those rows stay authoritative — copy
# management for existing titles happens through the reshelving/mark-found
# flows, not this form.
@router.post("", response_model=Book, status_code=status.HTTP_201_CREATED)
def create_book(body: BookWrite, librarian: UserProfile = Depends(require_librarian)):
    admin = get_admin_client()
    _check_accession_conflict(admin, body.accession_no)

    payload = body.model_dump()
    if payload.get("available_copies") is None:
        payload["available_copies"] = payload.get("total_copies")

    res = admin.table("books").insert(payload).execute()
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not create the book")
    return res.data[0]

@router.patch("/{book_id}", response_model=Book)
def update_book(book_id: str, body: BookUpdate, librarian: UserProfile = Depends(require_librarian)):
    admin = get_admin_client()
    existing = admin.table("books").select("id").eq("id", book_id).execute()
    if not existing.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Book not found")

    _check_accession_conflict(admin, body.accession_no, exclude_book_id=book_id)

    payload = body.model_dump()
    res = admin.table("books").update(payload).eq("id", book_id).execute()

    # Same derivation list_books/get_book use, so an edit to a title that
    # already has real book_copies rows doesn't briefly report the raw
    # (now stale) total_copies/available_copies the PATCH just wrote.
    copies_res = admin.table("book_copies").select("book_id, status").eq("book_id", book_id).execute()
    book = _apply_real_availability(res.data, copies_res.data)
    return book[0]

@router.get("/{book_id}", response_model=Book)
def get_book(book_id: str, user: UserProfile | None = Depends(get_optional_user)):
    db = get_client()
    admin = get_admin_client()
    # Book row and its copies don't depend on each other — fetch side by side.
    with ThreadPoolExecutor(max_workers=2) as pool:
        res_future = pool.submit(lambda: db.table("books").select("*").eq("id", book_id).execute())
        copies_future = pool.submit(
            lambda: admin.table("book_copies").select("id, book_id, status").eq("book_id", book_id).execute()
        )
        res = res_future.result()
        copies_res = copies_future.result()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Book not found")

    # A librarian can still open an archived book directly (e.g. from the
    # Weeding log, to restore it) — everyone else gets the same 404 as a
    # book that doesn't exist, not a "this book is archived" message that
    # would leak its existence.
    if res.data[0].get("archived_at") and (user is None or user.role != "librarian"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Book not found")

    book = _apply_real_availability(res.data, copies_res.data)

    # Phase 5, plan 5.1: no button, no date, no waiting count once a copy
    # is actually available — they should just go get it. Detail-page only
    # (not list_books) — not worth an N+1 cost across the whole catalog.
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

    book = _redact_accession(book, user)

    return book[0]

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
    return res.data

# Reverse of holds.py's report_missing. Per the status machine enforced in
# migration 0004, a side-state copy (lost/damaged/missing) can only exit
# through for_reshelving — never straight back to available — same as a
# real return. The librarian completes the transition through the existing
# reshelving scan (POST /loans/reshelve) once the copy is actually back on
# the shelf.
@router.post("/copies/{copy_id}/mark-found", status_code=status.HTTP_204_NO_CONTENT)
def mark_copy_found(copy_id: str, librarian: UserProfile = Depends(require_librarian)):
    admin = get_admin_client()
    copy_res = admin.table("book_copies").select("id, status").eq("id", copy_id).execute()
    if not copy_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Copy not found")
    copy = copy_res.data[0]
    if copy["status"] not in ("missing", "lost", "damaged"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"This copy is currently '{copy['status']}', not missing/lost/damaged",
        )
    admin.table("book_copies").update({"status": "for_reshelving"}).eq("id", copy_id).execute()


COVER_BUCKET = "book-covers"
MAX_COVER_BYTES = 5 * 1024 * 1024


# Checked against the file's own first bytes, not the client-sent
# content-type — that header is whatever the caller says it is.
def _sniff_image_type(data: bytes) -> tuple[str, str] | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", "jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp", "webp"
    return None


# Storage upload for the librarian book form. Server-side on purpose (the
# bucket has no browser write policy), so this is also where the 5 MB / image
# type limits the form only advertises actually get enforced. A fresh object
# name per upload keeps browsers/CDN from serving a stale cached cover.
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
