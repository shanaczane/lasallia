# The rules for book requests. routers/book_requests.py applies them on create
# and edit; the form in apps/web/lib/bookRequestForm.ts shows the same messages
# next to each field.

import re

from fastapi import HTTPException, status

from core.isbn import clean_isbn_input, normalize_isbn
from core.paging import fetch_all_rows, fetch_rows_for_ids

MAX_FILES_PER_REQUEST = 5
MIN_REJECTION_REASON_LENGTH = 10

# The only moves a librarian can make. Cancelling is the requester's own, so
# it isn't here.
TRANSITIONS: dict[str, set[str]] = {
    "pending": {"under_review"},
    "under_review": {"approved", "rejected"},
    "approved": {"fulfilled"},
}

# A request still going somewhere: asking again would be a duplicate.
OPEN_STATUSES = ["pending", "under_review", "approved"]
_UNAVAILABLE_COPY = {"lost", "missing"}


def _bad(message: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, message)


def clean_fields(fields: dict, max_copies: int) -> dict:
    """The required fields, trimmed, with the ISBN normalized. Raises a 400
    naming the first problem."""
    title = (fields.get("title") or "").strip()
    author = (fields.get("author") or "").strip()
    course = (fields.get("course") or "").strip()
    copies = fields.get("copies")
    if not title:
        raise _bad("Title is required")
    if not author:
        raise _bad("Author is required")
    if not isinstance(copies, int) or isinstance(copies, bool) or not 1 <= copies <= max_copies:
        raise _bad(f"Copies must be a whole number from 1 to {max_copies}")
    if not course:
        raise _bad("Related course is required")
    try:
        isbn = clean_isbn_input(fields.get("isbn"))
    except ValueError as e:
        raise _bad(str(e))
    return {"title": title, "author": author, "copies": copies, "course": course, "isbn": isbn}


def normalized_text(value: str | None) -> str:
    """Case, punctuation and spacing don't make a different book."""
    return " ".join(re.sub(r"[^\w\s]", " ", (value or "").lower()).split())


def _same_book(a: dict, b: dict) -> bool:
    """The same ISBN, or the same title and author when either has no ISBN."""
    a_isbn, b_isbn = normalize_isbn(a.get("isbn")), normalize_isbn(b.get("isbn"))
    if a_isbn and b_isbn:
        return a_isbn == b_isbn
    return (
        normalized_text(a.get("title")) == normalized_text(b.get("title"))
        and normalized_text(a.get("author")) == normalized_text(b.get("author"))
    )


def reject_duplicate(admin, requester_id: str, fields: dict, ignore_id: str | None = None) -> None:
    rows = (
        admin.table("book_requests").select("id, title, author, isbn, status")
        .eq("requester_id", requester_id).in_("status", OPEN_STATUSES).execute()
    ).data
    if any(r["id"] != ignore_id and _same_book(r, fields) for r in rows):
        raise HTTPException(status.HTTP_409_CONFLICT, "You already have an open request for this book")


def catalog_copy_count(admin, fields: dict) -> int | None:
    """Copies the library has of this title, or None when it isn't in the
    catalog. Matches by ISBN, or by title when the catalog's has no ISBN."""
    books = fetch_all_rows(lambda: (
        admin.table("books").select("id, title, isbn").is_("archived_at", "null").order("id")
    ))
    wanted_isbn = fields.get("isbn")
    wanted_title = normalized_text(fields.get("title"))
    ids = [
        b["id"] for b in books
        if (wanted_isbn and normalize_isbn(b.get("isbn")) == wanted_isbn)
        or normalized_text(b.get("title")) == wanted_title
    ]
    if not ids:
        return None
    copies = fetch_rows_for_ids(
        lambda part: admin.table("book_copies").select("id, status").in_("book_id", part).order("id"), ids,
    )
    return sum(1 for c in copies if c.get("status") not in _UNAVAILABLE_COPY)


def warn_if_in_catalog(admin, fields: dict) -> None:
    """A 409 the form turns into a warning; sending confirm_in_catalog goes ahead."""
    count = catalog_copy_count(admin, fields)
    if count is None:
        return
    raise HTTPException(status.HTTP_409_CONFLICT, {
        "code": "in_catalog",
        "copies": count,
        "message": f"This title is already in the catalog ({count} {'copy' if count == 1 else 'copies'}).",
    })


def check_transition(current: str, new: str) -> None:
    if new not in TRANSITIONS.get(current, set()):
        raise HTTPException(status.HTTP_409_CONFLICT, f"A request that is {current.replace('_', ' ')} can't be marked {new.replace('_', ' ')}")


def clean_rejection_reason(reason: str | None) -> str:
    text = (reason or "").strip()
    if len(text) < MIN_REJECTION_REASON_LENGTH:
        raise _bad(f"Give a reason of at least {MIN_REJECTION_REASON_LENGTH} characters")
    return text
