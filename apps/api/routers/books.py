from fastapi import APIRouter, Depends, HTTPException, status

from core.deps import get_optional_user
from core.supabase import get_admin_client, get_client
from schemas.auth import UserProfile
from schemas.book import Book, BookSearchResponse

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
        entry = agg.setdefault(row["book_id"], {"total": 0, "available": 0, "statuses": set()})
        entry["total"] += 1
        entry["statuses"].add(row["status"])
        if row["status"] == "available":
            entry["available"] += 1

    for b in books:
        entry = agg.get(b["id"])
        if entry:
            b["total_copies"] = entry["total"]
            b["available_copies"] = entry["available"]
            b["status"] = _derive_status(entry["statuses"])
    return books

@router.get("", response_model=BookSearchResponse)
def list_books(limit: int = DEFAULT_LIMIT, user: UserProfile | None = Depends(get_optional_user)):
    db = get_client()
    res = db.table("books").select("*").order("title").limit(limit).execute()
    books = res.data

    # book_copies has no public RLS policy (its only legitimate public-ish
    # access path is the token-authorized holds/loans flow) — the backend
    # itself is trusted to read it, same as it already is for redacting
    # accession_no below. Only the safe aggregate (counts/derived status)
    # ever leaves this function, never individual copy rows.
    #
    # Small dataset (~185 rows) — one unfiltered fetch is simpler and just
    # as cheap as filtering by the ids already on the page.
    copies_res = get_admin_client().table("book_copies").select("book_id, status").execute()
    books = _apply_real_availability(books, copies_res.data)
    books = _redact_accession(books, user)

    return BookSearchResponse(books=books, total=len(books), page=1, per_page=limit)

@router.get("/{book_id}", response_model=Book)
def get_book(book_id: str, user: UserProfile | None = Depends(get_optional_user)):
    db = get_client()
    res = db.table("books").select("*").eq("id", book_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Book not found")

    copies_res = get_admin_client().table("book_copies").select("book_id, status").eq("book_id", book_id).execute()
    book = _apply_real_availability(res.data, copies_res.data)
    book = _redact_accession(book, user)

    return book[0]
