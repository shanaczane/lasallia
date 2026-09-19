from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status

from core.notify import notify, notify_librarians
from core.settings import get_library_settings

# These collection types are for library use only and never leave the
# building — matches the build plan's Part 1.3 list exactly. Shared by both
# the digital kiosk's claim_hold (routers/holds.py) and the librarian-
# assisted desk checkout (routers/loans.py) so the two paths can't silently
# drift apart on what's borrowable.
NON_BORROWABLE_COLLECTION_TYPES = {"Reference", "Thesis", "Capstone", "MTR", "Archives"}

# One wording per cause — the same failure used to read differently depending
# on which endpoint hit it first. Kiosk sessions start with an ID tap, so
# that's what the student is told to do again. Shared by routers/holds.py
# and routers/loans.py.
SESSION_INVALID = "Your session isn't valid — please tap your ID again"
SESSION_ENDED = "Your session has ended — please tap your ID again"
HOLD_GONE = "This hold has expired or was already used — please start over at the kiosk"
NO_COPIES = "No copies are available to borrow right now"
COPY_BEING_BORROWED = "Someone else is borrowing the last available copy right now — please try again in a couple of minutes"


def check_borrow_eligibility(db, student_id: str, book_id: str) -> None:
    """Every Phase 3 blocking check that must pass before a copy is handed
    to a student, shared by the digital kiosk flow and the librarian-
    assisted desk flow so the same student gets the same answer regardless
    of who's driving. Raises HTTPException on the first failing check."""
    book_res = db.table("books").select("collection_type").eq("id", book_id).execute()
    if not book_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Book not found")
    collection_type = book_res.data[0]["collection_type"]
    if collection_type in NON_BORROWABLE_COLLECTION_TYPES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"{collection_type} items are for library use only and can't be borrowed",
        )

    current_loans = (
        db.table("loans")
        .select("id, due_date, book_copies(book_id)")
        .eq("student_id", student_id)
        .in_("status", ["active", "overdue"])
        .execute()
    ).data

    now = datetime.now(timezone.utc)
    if any(datetime.fromisoformat(loan["due_date"]) < now for loan in current_loans):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You have an overdue book — please return it before borrowing another")

    if any(loan["book_copies"]["book_id"] == book_id for loan in current_loans):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You already have a copy of this title checked out")

    cfg = get_library_settings(db)
    if len(current_loans) >= cfg["max_books_per_borrower"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"You've reached your borrowing limit of {cfg['max_books_per_borrower']} books")

    # Phase 4 closes the gap Phase 3 deferred here for lack of data: an
    # unsettled fine can exist on an already-returned loan, so this is a
    # separate, status-unscoped query rather than reusing current_loans.
    unsettled = (
        db.table("loans")
        .select("id", count="exact")
        .eq("student_id", student_id)
        .eq("fine_status", "unsettled")
        .execute()
    )
    if (unsettled.count or 0) > 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You have an unpaid fine — please settle it with the librarian")


def create_loan_and_notify(
    db,
    student_id: str,
    book_copy_id: str,
    book_id: str,
    station_session_id: str,
    condition: str,
    purpose: str | None,
    notes: str | None,
    assisted_by: str | None = None,
) -> dict:
    """Writes the loan, flips the copy to on_loan, closes a matching ready
    reservation, and fires the same 2 notifications as the digital kiosk
    flow — shared by confirm_loan (kiosk) and the librarian-assisted desk
    checkout, so both produce an identical record."""
    cfg = get_library_settings(db)
    due_date = (datetime.now(timezone.utc) + timedelta(days=cfg["standard_loan_period_days"])).isoformat()

    loan_res = db.table("loans").insert({
        "book_copy_id": book_copy_id,
        "student_id": student_id,
        "station_session_id": station_session_id,
        "due_date": due_date,
        "condition_at_borrow": condition,
        "purpose": purpose,
        "notes": notes,
        "assisted_by": assisted_by,
    }).execute()
    if not loan_res.data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not create the loan")

    # available -> on_loan, or reserved -> on_loan (a queued pickup claimed
    # via holds.py's ready-reservation branch): both legal per Phase 1's
    # status-machine trigger.
    db.table("book_copies").update({"status": "on_loan"}).eq("id", book_copy_id).execute()

    # If this copy was being held for a reservation (a queued pickup, not a
    # walk-in claim on a genuinely available copy), close that reservation
    # out now — a copy can have at most one 'ready' reservation attached at
    # a time, so this only ever touches the one it was actually held for.
    db.table("reservations").update({
        "status": "fulfilled",
        "fulfilled_at": datetime.now(timezone.utc).isoformat(),
    }).eq("book_copy_id", book_copy_id).eq("status", "ready").eq("user_id", student_id).execute()

    loan = loan_res.data[0]
    book_res = db.table("books").select("*").eq("id", book_id).execute()
    loan["books"] = book_res.data[0] if book_res.data else None

    book_title = loan["books"]["title"] if loan["books"] else "A book"
    due_label = datetime.fromisoformat(due_date).strftime("%B %d, %Y")
    notify(
        student_id, "loan_confirmed",
        "Book successfully borrowed",
        f'You\'ve borrowed "{book_title}". It\'s due back on {due_label}.',
        link="/student/library",
    )
    borrower_res = db.table("profiles").select("full_name").eq("id", student_id).execute()
    borrower_name = borrower_res.data[0]["full_name"] if borrower_res.data else "A student"
    notify_librarians(
        "Book checked out",
        f'{borrower_name} checked out "{book_title}", due {due_label}.',
        link="/librarian/borrow-return",
    )

    return loan
