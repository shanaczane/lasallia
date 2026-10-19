from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status

from core.accession import normalize_accession_number
from core.notify import notify, notify_librarians
from core.email_template import EmailContent, long_date, peso, staff_alert
from core.reservations import promote_next_reservation
from core.settings import get_library_settings

# Library-use-only collections; they can't be borrowed. Shared by the kiosk
# and desk checkout so both follow the same rule.
NON_BORROWABLE_COLLECTION_TYPES = {"Reference", "Thesis", "Capstone", "MTR", "Archives"}

# Error messages shared by the kiosk and desk borrowing endpoints.
SESSION_INVALID = "Your session isn't valid — please tap your ID again"
SESSION_ENDED = "Your session has ended — please tap your ID again"
HOLD_GONE = "This hold has expired or was already used — please start over at the kiosk"
NO_COPIES = "No copies are available to borrow right now"
COPY_BEING_BORROWED = "Someone else is borrowing the last available copy right now — please try again in a couple of minutes"


def check_borrow_eligibility(db, student_id: str, book_id: str) -> None:
    """All checks before a student can borrow, used by both the kiosk and
    the desk. Raises HTTPException on the first one that fails."""
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

    # Separate query: an unpaid fine can be on a loan that's already returned.
    unsettled = (
        db.table("loans")
        .select("id", count="exact")
        .eq("student_id", student_id)
        .eq("fine_status", "unsettled")
        .execute()
    )
    if (unsettled.count or 0) > 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You have an unpaid fine — please settle it with the librarian")


def ensure_initial_copy(admin, book_id: str) -> None:
    """Creates a book's first copy (using its accession number) if it has
    none, so it can be borrowed. Safe to call more than once."""
    if admin.table("book_copies").select("id").eq("book_id", book_id).limit(1).execute().data:
        return
    book_res = admin.table("books").select("accession_no, shelf_location").eq("id", book_id).execute()
    if not book_res.data or not book_res.data[0].get("accession_no"):
        return
    book = book_res.data[0]
    admin.table("book_copies").upsert({
        "book_id": book_id,
        "accession_number": normalize_accession_number(book["accession_no"]),
        "status": "available",
        "shelf_location": book.get("shelf_location") or "Unassigned",
    }, on_conflict="accession_number", ignore_duplicates=True).execute()


def find_removal_blocker(admin, book_id: str) -> str | None:
    """None if the book can be archived or deleted, otherwise why not (a
    copy is on loan, or a returned loan still has an unpaid fine).
    """
    copy_ids = [c["id"] for c in admin.table("book_copies").select("id").eq("book_id", book_id).execute().data]
    if not copy_ids:
        return None

    loans = (
        admin.table("loans")
        .select("status, fine_status")
        .in_("book_copy_id", copy_ids)
        .execute()
    ).data

    if any(l["status"] in ("active", "overdue") for l in loans):
        return "has an outstanding loan — return the book before archiving or deleting it"
    if any(l.get("fine_status") == "unsettled" for l in loans):
        return "has an unpaid fine — settle it with the patron before archiving or deleting it"
    return None


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
    hold_token: str | None = None,
) -> dict:
    """Creates the loan, marks the copy on loan, closes the student's ready
    reservation for it, and notifies the student and librarians. Used by
    both the kiosk and the desk."""
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
        "hold_token": hold_token,
    }).execute()
    if not loan_res.data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not create the loan")

    # From available, or from reserved when it's a reservation pickup.
    db.table("book_copies").update({"status": "on_loan"}).eq("id", book_copy_id).execute()

    # If the copy was held for this student's reservation, mark it fulfilled.
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
        link="/user/library",
        email=EmailContent(
            subject=f"Borrowing confirmed: {book_title}",
            intro="This confirms that you borrowed a book from the LRC.",
            details=[
                ("Title", book_title),
                ("Borrowed on", long_date(loan["borrowed_at"] if loan.get("borrowed_at") else datetime.now(timezone.utc))),
                ("Due date", long_date(due_date)),
            ],
            paragraphs=[
                "Please return it to the LRC counter on or before the due date to avoid an overdue fine "
                f"of {peso(cfg['fine_per_day'])} per school day.",
            ],
            link_label="View your loans",
            link="/user/library",
        ),
    )
    borrower_res = db.table("profiles").select("full_name").eq("id", student_id).execute()
    borrower_name = borrower_res.data[0]["full_name"] if borrower_res.data else "A student"
    notify_librarians(
        "Book checked out",
        f'{borrower_name} checked out "{book_title}", due {due_label}.',
        link="/librarian/borrow-return",
        email=staff_alert(
            subject=f"Book checked out: {book_title}",
            intro="A book has been checked out in Lasallia.",
            details=[
                ("Borrower", borrower_name),
                ("Title", book_title),
                ("Due date", long_date(due_date)),
            ],
            action="No action is needed. The loan is recorded under Borrow & Return.",
            link_label="View Borrow & Return",
            link="/librarian/borrow-return",
        ),
    )

    return loan


def reshelve_copy_now(admin, copy: dict, accession_display: str) -> str:
    """Puts a copy back into circulation once it's on its shelf. The only
    way a copy becomes 'available' (used by the Reshelving scan and by
    inventory scans).

    Someone may have reserved the book meanwhile, so they get it first.
    Returns the new status: 'reserved' or 'available'."""
    promoted = promote_next_reservation(admin, copy["book_id"], copy["id"])
    admin.table("book_copies").update({
        "status": "reserved" if promoted else "available",
        # Feeds the "Reshelved Today" list, whatever the new status is.
        "reshelved_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", copy["id"]).execute()

    # Tell librarians the copy is back on the shelf (or on hold).
    book_res = admin.table("books").select("title").eq("id", copy["book_id"]).execute()
    book_title = book_res.data[0]["title"] if book_res.data else "A book"
    if promoted:
        notify_librarians(
            "Book reshelved — held for next reservation",
            f'"{book_title}" ({accession_display}) is on hold for the next reservation instead of going back on the shelf.',
            link="/librarian/reservations",
            email=staff_alert(
                subject=f"Held for a reservation: {book_title}",
                intro="A reshelved book has been set aside for the next person in the reservation queue.",
                details=[("Title", book_title), ("Accession No.", accession_display), ("Status", "Held for reservation")],
                action="Please place it on the hold shelf at the LRC counter for pickup.",
                link_label="View reservations",
                link="/librarian/reservations",
            ),
        )
        return "reserved"

    notify_librarians(
        "Book reshelved",
        f'"{book_title}" ({accession_display}) is back on the shelf and available.',
        link="/librarian/borrow-return?tab=reshelving",
        email=staff_alert(
            subject=f"Book reshelved: {book_title}",
            intro="A book is back on its shelf and available to borrow.",
            details=[("Title", book_title), ("Accession No.", accession_display), ("Status", "Available")],
            action="No action is needed.",
            link_label="View reshelving",
            link="/librarian/borrow-return?tab=reshelving",
        ),
    )
    return "available"
