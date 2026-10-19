from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from supabase import Client

from core.accession import normalize_accession_number
from core.calendar import compute_fine
from core.deps import get_current_user, get_user_supabase, require_librarian
from core.loans import HOLD_GONE, check_borrow_eligibility, create_loan_and_notify, reshelve_copy_now
from core.notify import notify, notify_librarians
from core.email_template import EmailContent, long_date, peso, staff_alert
from core.reservations import maybe_sweep_expired_reservations, promote_next_reservation
from core.supabase import get_admin_client
from schemas.auth import UserProfile
from schemas.loan import (
    ConfirmLoanRequest,
    LibrarianAssistedLoanRequest,
    Loan,
    LoanLookupResult,
    ReshelvedItem,
    ReshelveRequest,
    ReshelvingQueueItem,
    ReturnLoanRequest,
    SettleFineRequest,
)

router = APIRouter(prefix="/loans", tags=["loans"])

MAX_ATTEMPTS = 3
DAMAGE_PROCESSING_FEE = 50.0


def _embed_book_and_borrower(db: Client, query):
    # loans links to profiles twice, so name the borrower (student_id) link
    # or the query fails.
    return query.select("*, book_copies(book_id, accession_number, books(*)), profiles!loans_student_id_fkey(full_name, avatar_url)")


def _flatten_loan(loan: dict) -> dict:
    copy = loan.pop("book_copies", None)
    loan["books"] = copy["books"] if copy else None
    loan["accession_number"] = copy["accession_number"] if copy else None
    return loan


def _loan_for_hold_token(db: Client, token: str) -> dict | None:
    """The loan a kiosk hold token was already confirmed into, if any."""
    res = _embed_book_and_borrower(db, db.table("loans")).eq("hold_token", token).execute()
    return _flatten_loan(res.data[0]) if res.data else None


@router.get("", response_model=list[Loan])
def list_loans(
    student_id: str | None = None,
    # For "Borrowed/Returned Today": the browser sends the day's start and
    # end, so the server doesn't guess the timezone.
    borrowed_from: str | None = None,
    borrowed_to: str | None = None,
    returned_from: str | None = None,
    returned_to: str | None = None,
    user: UserProfile = Depends(get_current_user),
    db: Client = Depends(get_user_supabase),
):
    # RLS limits students to their own loans; librarians see all.
    # student_id narrows a librarian's view to one patron.
    maybe_sweep_expired_reservations(get_admin_client())
    query = db.table("loans").select("*").order("borrowed_at", desc=True)
    if student_id:
        query = query.eq("student_id", student_id)
    if borrowed_from:
        query = query.gte("borrowed_at", borrowed_from)
    if borrowed_to:
        query = query.lt("borrowed_at", borrowed_to)
    if returned_from:
        query = query.gte("returned_at", returned_from)
    if returned_to:
        query = query.lt("returned_at", returned_to)
    res = query.execute()
    loans = res.data

    # Copies need the admin client (no RLS access). Safe, since the user
    # could already see these loans.
    admin = get_admin_client()
    copy_ids = list({loan["book_copy_id"] for loan in loans})
    books_by_copy_id: dict[str, dict | None] = {}
    accession_by_copy_id: dict[str, str | None] = {}
    if copy_ids:
        copies = admin.table("book_copies").select("id, book_id, accession_number").in_("id", copy_ids).execute().data
        book_ids = list({c["book_id"] for c in copies})
        books = admin.table("books").select("*").in_("id", book_ids).execute().data if book_ids else []
        books_by_id = {b["id"]: b for b in books}
        books_by_copy_id = {c["id"]: books_by_id.get(c["book_id"]) for c in copies}
        accession_by_copy_id = {c["id"]: c["accession_number"] for c in copies}
    for loan in loans:
        loan["books"] = books_by_copy_id.get(loan["book_copy_id"])
        # Used by the return flow's "active borrowers" list.
        loan["accession_number"] = accession_by_copy_id.get(loan["book_copy_id"])

    # Borrower names for the librarian dashboard's activity feed.
    student_ids = list({loan["student_id"] for loan in loans})
    profiles_by_id: dict[str, dict] = {}
    if student_ids:
        profiles = admin.table("profiles").select("id, full_name, avatar_url").in_("id", student_ids).execute().data
        profiles_by_id = {p["id"]: p for p in profiles}
    for loan in loans:
        loan["profiles"] = profiles_by_id.get(loan["student_id"])

    # The database doesn't set "overdue", so work it out from the due date.
    now = datetime.now(timezone.utc)
    for loan in loans:
        if loan["status"] == "active" and datetime.fromisoformat(loan["due_date"]) < now:
            loan["status"] = "overdue"

    # Fine so far for open overdue loans (same calculation everywhere).
    for loan in loans:
        if loan["status"] == "overdue":
            collection_type = (loan["books"] or {}).get("collection_type") or "General"
            days_overdue, preview_fine = compute_fine(admin, loan["due_date"], collection_type)
            loan["days_overdue"] = days_overdue
            loan["preview_fine_amount"] = preview_fine

    return loans

# Confirms a kiosk borrow. No login: the hold token is the credential. The
# typed accession number is checked here and never sent to the browser.
@router.post("", response_model=Loan, status_code=status.HTTP_201_CREATED)
def confirm_loan(body: ConfirmLoanRequest):
    db = get_admin_client()

    # If this token already became a loan (e.g. "Try again" after a timeout),
    # return that loan instead of an error.
    existing = _loan_for_hold_token(db, body.token)
    if existing:
        return existing

    hold_res = db.table("soft_holds").select("*").eq("token", body.token).execute()
    if not hold_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, HOLD_GONE)
    hold = hold_res.data[0]

    if datetime.fromisoformat(hold["expires_at"]) < datetime.now(timezone.utc):
        db.table("soft_holds").delete().eq("id", hold["id"]).execute()
        raise HTTPException(status.HTTP_410_GONE, HOLD_GONE)

    copy_res = db.table("book_copies").select("*").eq("id", hold["book_copy_id"]).execute()
    if not copy_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Copy not found")
    copy = copy_res.data[0]

    submitted = normalize_accession_number(body.accession_number).lower()
    actual = normalize_accession_number(copy["accession_number"] or "").lower()

    if submitted != actual:
        attempts = hold["attempt_count"] + 1
        if attempts >= MAX_ATTEMPTS:
            db.table("soft_holds").delete().eq("id", hold["id"]).execute()
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Too many incorrect attempts — please see the librarian")
        db.table("soft_holds").update({"attempt_count": attempts}).eq("id", hold["id"]).execute()
        remaining = MAX_ATTEMPTS - attempts
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"That number belongs to a different book. Please check the label. ({remaining} attempt{'s' if remaining != 1 else ''} left)",
        )

    session_res = db.table("station_sessions").select("student_id").eq("id", hold["station_session_id"]).execute()
    if not session_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Station session not found")
    student_id = session_res.data[0]["student_id"]

    try:
        loan = create_loan_and_notify(
            db, student_id, copy["id"], copy["book_id"], hold["station_session_id"],
            body.condition, body.purpose, body.notes, hold_token=body.token,
        )
    except APIError as e:
        # Two confirms arrived at once and the other one won; return its loan.
        if e.code == "23505":
            existing = _loan_for_hold_token(db, body.token)
            if existing:
                return existing
        raise

    db.table("soft_holds").delete().eq("id", hold["id"]).execute()

    return loan

# Checkout at the desk. The librarian has the book, so no hold is needed
# and the scanned accession number picks the exact copy.
@router.post("/librarian-assisted", response_model=Loan, status_code=status.HTTP_201_CREATED)
def create_librarian_assisted_loan(
    body: LibrarianAssistedLoanRequest,
    librarian: UserProfile = Depends(require_librarian),
):
    admin = get_admin_client()

    session_res = (
        admin.table("station_sessions")
        .select("student_id, auth_method, ended_at")
        .eq("id", body.station_session_id)
        .execute()
    )
    if not session_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That session isn't valid — tap the student's ID again")
    session = session_res.data[0]
    if session["ended_at"] is not None:
        raise HTTPException(status.HTTP_410_GONE, "That session has ended — tap the student's ID again")
    if session["auth_method"] not in ("rfid", "librarian_assisted"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Librarian-assisted borrow requires an RFID tap or a librarian-selected student")
    student_id = session["student_id"]

    copy_res = (
        admin.table("book_copies")
        .select("id, book_id, status")
        .eq("accession_number", normalize_accession_number(body.accession_number))
        .execute()
    )
    if not copy_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No copy with that accession number")
    copy = copy_res.data[0]

    # A reserved copy can only go to the student it's reserved for.
    if copy["status"] == "reserved":
        own_ready_reservation = (
            admin.table("reservations")
            .select("id")
            .eq("book_copy_id", copy["id"])
            .eq("status", "ready")
            .eq("user_id", student_id)
            .execute()
        )
        if not own_ready_reservation.data:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "This copy is on hold for another patron's reservation")
    elif copy["status"] != "available":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"This copy isn't available to borrow (status: {copy['status']})")

    check_borrow_eligibility(admin, student_id, copy["book_id"])

    return create_loan_and_notify(
        admin, student_id, copy["id"], copy["book_id"], body.station_session_id,
        body.condition, body.purpose, body.notes, assisted_by=librarian.id,
    )

# Finds the open loan for a scanned or typed accession number (returns).
@router.get("/lookup", response_model=LoanLookupResult)
def lookup_loan(
    accession_number: str,
    librarian: UserProfile = Depends(require_librarian),
):
    # Admin client: copies have no RLS access. require_librarian guards this.
    admin = get_admin_client()
    copy_res = admin.table("book_copies").select("id, book_id").eq("accession_number", normalize_accession_number(accession_number)).execute()
    if not copy_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No copy with that accession number")
    copy = copy_res.data[0]

    loan_res = (
        _embed_book_and_borrower(admin, admin.table("loans"))
        .eq("book_copy_id", copy["id"])
        .in_("status", ["active", "overdue"])
        .execute()
    )
    if not loan_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This copy isn't currently out on loan")
    loan = _flatten_loan(loan_res.data[0])

    book_res = admin.table("books").select("collection_type").eq("id", copy["book_id"]).execute()
    collection_type = book_res.data[0]["collection_type"] if book_res.data else "General"
    days_overdue, preview_fine = compute_fine(admin, loan["due_date"], collection_type)

    return LoanLookupResult(**loan, days_overdue=days_overdue, preview_fine_amount=preview_fine)

# Search open loans by title or borrower name, for unreadable labels.
# Filtered in Python.
@router.get("/search", response_model=list[LoanLookupResult])
def search_loans(
    q: str,
    librarian: UserProfile = Depends(require_librarian),
):
    needle = q.strip().lower()
    if not needle:
        return []

    # Admin client, as in lookup_loan.
    admin = get_admin_client()
    loans_res = (
        _embed_book_and_borrower(admin, admin.table("loans"))
        .in_("status", ["active", "overdue"])
        .execute()
    )

    results = []
    for raw in loans_res.data:
        book_copies = raw.get("book_copies") or {}
        book = book_copies.get("books") or {}
        borrower = raw.get("profiles") or {}
        title = (book.get("title") or "").lower()
        name = (borrower.get("full_name") or "").lower()
        if needle not in title and needle not in name:
            continue
        loan = _flatten_loan(raw)
        days_overdue, preview_fine = compute_fine(admin, loan["due_date"], book.get("collection_type") or "General")
        results.append(LoanLookupResult(**loan, days_overdue=days_overdue, preview_fine_amount=preview_fine))
        if len(results) >= 20:
            break

    return results

# Returns a book: records condition and any fine, closes the loan, and
# sends the copy to the hold shelf (if reserved) or to reshelving. Never
# straight to available.
@router.post("/{loan_id}/return", response_model=Loan)
def return_loan(
    loan_id: str,
    body: ReturnLoanRequest,
    librarian: UserProfile = Depends(require_librarian),
):
    admin = get_admin_client()

    loan_res = admin.table("loans").select("*").eq("id", loan_id).execute()
    if not loan_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Loan not found")
    loan = loan_res.data[0]
    if loan["status"] == "returned":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This loan has already been returned")

    copy_res = admin.table("book_copies").select("id, book_id, accession_number").eq("id", loan["book_copy_id"]).execute()
    copy = copy_res.data[0]
    book_res = admin.table("books").select("collection_type").eq("id", copy["book_id"]).execute()
    collection_type = book_res.data[0]["collection_type"] if book_res.data else "General"

    _, overdue_fine = compute_fine(admin, loan["due_date"], collection_type)

    # Only charge for damage that wasn't noted when it was borrowed.
    is_new_damage = loan["condition_at_borrow"] == "good" and body.condition_at_return in ("damaged", "incomplete")
    damage_fine = round((body.replacement_cost or 0) + DAMAGE_PROCESSING_FEE, 2) if is_new_damage else 0.0

    total_fine = round(overdue_fine + damage_fine, 2)
    if total_fine > 0 and body.fine_settlement is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"This loan has a ₱{total_fine:.2f} fine — mark it Paid or Unsettled before confirming")
    if body.fine_settlement == "paid" and not body.receipt_number:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A receipt number is required to mark a fine as paid")

    return_fields = {
        "returned_at": datetime.now(timezone.utc).isoformat(),
        "status": "returned",
        "condition_at_return": body.condition_at_return,
        "condition_notes": body.condition_notes,
        "fine_amount": total_fine,
        "fine_status": body.fine_settlement if total_fine > 0 else "none",
        "receipt_number": body.receipt_number if body.fine_settlement == "paid" else None,
    }
    # Save each part of the fine separately. If those columns don't exist
    # yet, save just the total rather than fail the return.
    try:
        update_res = admin.table("loans").update({
            **return_fields,
            "overdue_fine_amount": round(overdue_fine, 2),
            "damage_fine_amount": damage_fine,
        }).eq("id", loan_id).execute()
    except Exception:
        update_res = admin.table("loans").update(return_fields).eq("id", loan_id).execute()
    loan = update_res.data[0]

    # If someone reserved this book, the copy goes to them (hold shelf).
    book_full_res = admin.table("books").select("*").eq("id", copy["book_id"]).execute()
    book_title = book_full_res.data[0]["title"] if book_full_res.data else "A book"

    promoted = promote_next_reservation(admin, copy["book_id"], copy["id"])
    needs_reshelving = not promoted
    admin.table("book_copies").update(
        {"status": "reserved" if promoted else "for_reshelving"}
    ).eq("id", copy["id"]).execute()

    # Email: the fine details if there's a fine, else a short confirmation.
    fine_email = EmailContent(
        subject=f"Return confirmed: {book_title}",
        intro="Thank you! Your borrowed book has been returned to the LRC.",
        details=[
            ("Title", book_title),
            ("Due date", long_date(loan["due_date"])),
            ("Returned on", long_date(loan["returned_at"])),
        ],
        paragraphs=["No fine was recorded for this return."],
        link_label="View your loans",
        link="/user/library",
    )
    if total_fine > 0:
        parts = []
        if overdue_fine > 0:
            parts.append(f"late return {peso(overdue_fine)}")
        if damage_fine > 0:
            parts.append(f"damage {peso(damage_fine)}")
        paid_now = body.fine_settlement == "paid"
        fine_email = EmailContent(
            subject=f"Fine recorded for {book_title}",
            intro="Your returned book has been checked in, and a fine was recorded for it.",
            details=[
                ("Title", book_title),
                ("Due date", long_date(loan["due_date"])),
                ("Returned on", long_date(loan["returned_at"])),
                ("Fine", f"{peso(total_fine)} ({', '.join(parts)})" if parts else peso(total_fine)),
                ("Status", f"Paid (Receipt No. {body.receipt_number})" if paid_now else "Unpaid"),
            ],
            paragraphs=[
                "Thank you, your payment has been recorded. Please keep your receipt."
                if paid_now else
                "Please settle this fine in person at the LRC counter. Unpaid fines may keep you "
                "from borrowing or reserving books until they are paid.",
            ],
            link_label="View your loans",
            link="/user/library",
        )
    notify(
        loan["student_id"], "return_confirmed",
        "Return confirmed",
        f'"{book_title}" has been checked in.' + (f" A ₱{total_fine:.2f} fine was recorded." if total_fine > 0 else ""),
        link="/user/library",
        email=fine_email,
    )
    borrower_res = admin.table("profiles").select("full_name").eq("id", loan["student_id"]).execute()
    borrower_name = borrower_res.data[0]["full_name"] if borrower_res.data else "A student"
    fine_note = f" ₱{total_fine:.2f} fine recorded." if total_fine > 0 else ""

    # Tell librarians where the copy goes next (hold shelf or reshelving).
    return_details = [
        ("Borrower", borrower_name),
        ("Title", book_title),
        ("Accession No.", copy.get("accession_number")),
        ("Returned on", long_date(loan["returned_at"])),
        ("Fine", f"{peso(total_fine)} ({'paid' if body.fine_settlement == 'paid' else 'unpaid'})" if total_fine > 0 else "None"),
    ]
    if needs_reshelving:
        notify_librarians(
            "Book ready for reshelving",
            f'{borrower_name} returned "{book_title}" — it needs to be walked back to the shelf.{fine_note}',
            link="/librarian/borrow-return?tab=reshelving",
            email=staff_alert(
                subject=f"Book returned: {book_title}",
                intro="A borrowed book has been returned and is ready for reshelving.",
                details=return_details,
                action="Please return it to its shelf, then scan it under Reshelving.",
                link_label="Open reshelving",
                link="/librarian/borrow-return?tab=reshelving",
            ),
        )
    else:
        notify_librarians(
            "Book returned — held for next reservation",
            f'{borrower_name} returned "{book_title}"; it\'s now on hold for the next reservation.{fine_note}',
            link="/librarian/reservations",
            email=staff_alert(
                subject=f"Book returned and held: {book_title}",
                intro="A returned book has been set aside for the next person in the reservation queue.",
                details=return_details,
                action="Please place it on the hold shelf at the LRC counter for pickup.",
                link_label="View reservations",
                link="/librarian/reservations",
            ),
        )

    loan["books"] = book_full_res.data[0] if book_full_res.data else None
    loan["needs_reshelving"] = needs_reshelving

    return loan

# Records that an unpaid fine was paid at the desk later. Only updates the
# fine status and receipt; it doesn't take payments.
@router.patch("/{loan_id}/settle-fine", response_model=Loan)
def settle_fine(
    loan_id: str,
    body: SettleFineRequest,
    librarian: UserProfile = Depends(require_librarian),
):
    admin = get_admin_client()

    loan_res = admin.table("loans").select("*").eq("id", loan_id).execute()
    if not loan_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Loan not found")
    loan = loan_res.data[0]

    if loan["status"] != "returned":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This loan hasn't been returned yet")
    if loan["fine_status"] != "unsettled":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This loan has no unsettled fine to record")

    receipt_number = body.receipt_number.strip()
    if not receipt_number:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A receipt number is required")

    update_res = admin.table("loans").update({
        "fine_status": "paid",
        "receipt_number": receipt_number,
    }).eq("id", loan_id).execute()
    loan = update_res.data[0]

    copy_res = admin.table("book_copies").select("book_id").eq("id", loan["book_copy_id"]).execute()
    book_id = copy_res.data[0]["book_id"] if copy_res.data else None
    book_res = admin.table("books").select("*").eq("id", book_id).execute() if book_id else None
    loan["books"] = book_res.data[0] if book_res and book_res.data else None

    book_title = loan["books"]["title"] if loan["books"] else "A book"
    notify(
        loan["student_id"], "fine_settled",
        "Fine settled",
        f'Your ₱{loan["fine_amount"]:.2f} fine for "{book_title}" has been recorded as paid (receipt {receipt_number}).',
        link="/user/library",
        email=EmailContent(
            subject="Payment received for your fine",
            intro="We've received your payment. Your fine has been recorded as paid.",
            details=[
                ("Title", book_title),
                ("Amount paid", peso(loan["fine_amount"])),
                ("Receipt No.", receipt_number),
                ("Date recorded", long_date(datetime.now(timezone.utc))),
            ],
            paragraphs=["Please keep your receipt as proof of payment."],
            link_label="View your loans",
            link="/user/library",
        ),
    )

    return loan

# Copies waiting to be reshelved, most recently returned first.
@router.get("/reshelving-queue", response_model=list[ReshelvingQueueItem])
def reshelving_queue(librarian: UserProfile = Depends(require_librarian)):
    admin = get_admin_client()
    copies = admin.table("book_copies").select("id, accession_number, book_id").eq("status", "for_reshelving").execute().data
    if not copies:
        return []

    book_ids = list({c["book_id"] for c in copies})
    books = admin.table("books").select("*").in_("id", book_ids).execute().data
    books_by_id = {b["id"]: b for b in books}

    copy_ids = [c["id"] for c in copies]
    returned_loans = (
        admin.table("loans")
        .select("book_copy_id, returned_at")
        .in_("book_copy_id", copy_ids)
        .eq("status", "returned")
        .order("returned_at", desc=True)
        .execute()
        .data
    )
    # Rows are newest first, so keep the first one per copy.
    returned_at_by_copy: dict[str, str] = {}
    for row in returned_loans:
        returned_at_by_copy.setdefault(row["book_copy_id"], row["returned_at"])

    items = [
        ReshelvingQueueItem(
            id=c["id"],
            accession_number=c["accession_number"],
            books=books_by_id.get(c["book_id"]),
            returned_at=returned_at_by_copy.get(c["id"]),
        )
        for c in copies
    ]
    items.sort(key=lambda i: i.returned_at or "", reverse=True)
    return items

# Reshelving scan, once the book is back on its shelf. Makes the copy
# available (or holds it for a reservation).
@router.post("/reshelve", response_model=dict)
def reshelve_copy(
    body: ReshelveRequest,
    librarian: UserProfile = Depends(require_librarian),
):
    admin = get_admin_client()
    copy_res = admin.table("book_copies").select("id, book_id, status").eq("accession_number", normalize_accession_number(body.accession_number)).execute()
    if not copy_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No copy with that accession number")
    copy = copy_res.data[0]
    if copy["status"] != "for_reshelving":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This copy isn't awaiting reshelving")

    new_status = reshelve_copy_now(admin, copy, body.accession_number.strip())
    return {"id": copy["id"], "status": new_status}

# "Reshelved Today" list. The browser sends the day's start and end.
@router.get("/reshelved", response_model=list[ReshelvedItem])
def reshelved_copies(
    reshelved_from: str | None = None,
    reshelved_to: str | None = None,
    librarian: UserProfile = Depends(require_librarian),
):
    admin = get_admin_client()
    query = admin.table("book_copies").select("id, accession_number, book_id, reshelved_at").not_.is_("reshelved_at", "null")
    if reshelved_from:
        query = query.gte("reshelved_at", reshelved_from)
    if reshelved_to:
        query = query.lt("reshelved_at", reshelved_to)
    copies = query.order("reshelved_at", desc=True).execute().data
    if not copies:
        return []

    book_ids = list({c["book_id"] for c in copies})
    books = admin.table("books").select("*").in_("id", book_ids).execute().data
    books_by_id = {b["id"]: b for b in books}

    return [
        ReshelvedItem(
            id=c["id"],
            accession_number=c["accession_number"],
            books=books_by_id.get(c["book_id"]),
            reshelved_at=c["reshelved_at"],
        )
        for c in copies
    ]
