from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from core.calendar import compute_fine
from core.deps import get_current_user, get_user_supabase, require_librarian
from core.notify import notify, notify_librarians
from core.settings import get_library_settings
from core.supabase import get_admin_client
from schemas.auth import UserProfile
from schemas.loan import (
    ConfirmLoanRequest,
    Loan,
    LoanLookupResult,
    ReshelveRequest,
    ReshelvingQueueItem,
    ReturnLoanRequest,
)

router = APIRouter(prefix="/loans", tags=["loans"])

MAX_ATTEMPTS = 3
DAMAGE_PROCESSING_FEE = 50.0


def _embed_book_and_borrower(db: Client, query):
    return query.select("*, book_copies(book_id, accession_number, books(*)), profiles(full_name, avatar_url)")


def _flatten_loan(loan: dict) -> dict:
    copy = loan.pop("book_copies", None)
    loan["books"] = copy["books"] if copy else None
    loan["accession_number"] = copy["accession_number"] if copy else None
    return loan


@router.get("", response_model=list[Loan])
def list_loans(
    student_id: str | None = None,
    user: UserProfile = Depends(get_current_user),
    db: Client = Depends(get_user_supabase),
):
    # RLS scopes this automatically (0009): students see only their own
    # loans, librarians see every loan. student_id narrows a librarian's
    # already-full view to one patron (the Patrons profile modal) — RLS
    # already stops a student from passing someone else's id here, since
    # their own query is scoped to their own rows regardless.
    query = db.table("loans").select("*").order("borrowed_at", desc=True)
    if student_id:
        query = query.eq("student_id", student_id)
    res = query.execute()
    loans = res.data

    # book_copies has no RLS policy for authenticated callers at all (see
    # routers/books.py) — even the caller's own JWT can't embed through it,
    # PostgREST just silently returns book_copies: null instead of erroring.
    # loan.book_copy_id is a plain column already on the (correctly scoped)
    # row above, so this second hop only needs the admin client, never the
    # caller's own — the loan row itself already proved they can see it.
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
        # Return flow's "browse active borrowers" list needs this to
        # pre-fill the accession-number confirmation step (build plan's
        # existing scan/type-to-verify step, not bypassed by browsing).
        loan["accession_number"] = accession_by_copy_id.get(loan["book_copy_id"])

    # Borrower name/avatar — needed by the librarian dashboard's activity
    # feed. profiles_select_librarian (0008) already lets a librarian's own
    # JWT read this directly, but the admin client is simplest here since
    # we're already using it above for the same batch-lookup shape.
    student_ids = list({loan["student_id"] for loan in loans})
    profiles_by_id: dict[str, dict] = {}
    if student_ids:
        profiles = admin.table("profiles").select("id, full_name, avatar_url").in_("id", student_ids).execute().data
        profiles_by_id = {p["id"]: p for p in profiles}
    for loan in loans:
        loan["profiles"] = profiles_by_id.get(loan["student_id"])

    # "overdue" is never written back by anything yet (no return flow, no
    # cron) — a loan whose due_date has passed still says status: "active"
    # in the row. Recompute it here for display rather than trust the
    # stored value, same reasoning as catalog availability.
    now = datetime.now(timezone.utc)
    for loan in loans:
        if loan["status"] == "active" and datetime.fromisoformat(loan["due_date"]) < now:
            loan["status"] = "overdue"

    # Fine preview for the still-open overdue rows (build plan's Reports
    # overdue table needs this) — reuses the same school-day-calendar-aware
    # compute_fine everything else already trusts, rather than a naive
    # days*rate reimplemented in the frontend that could silently disagree
    # with it around weekends/holidays.
    for loan in loans:
        if loan["status"] == "overdue":
            collection_type = (loan["books"] or {}).get("collection_type") or "General"
            days_overdue, preview_fine = compute_fine(admin, loan["due_date"], collection_type)
            loan["days_overdue"] = days_overdue
            loan["preview_fine_amount"] = preview_fine

    return loans

# Not behind auth, same reasoning as routers/holds.py — the token is the
# credential. The accession number the student types is compared
# server-side against the copy the hold already pinned; it is never sent
# to the client for comparison there.
@router.post("", response_model=Loan, status_code=status.HTTP_201_CREATED)
def confirm_loan(body: ConfirmLoanRequest):
    db = get_admin_client()

    hold_res = db.table("soft_holds").select("*").eq("token", body.token).execute()
    if not hold_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This hold doesn't exist or has already been used")
    hold = hold_res.data[0]

    if datetime.fromisoformat(hold["expires_at"]) < datetime.now(timezone.utc):
        db.table("soft_holds").delete().eq("id", hold["id"]).execute()
        raise HTTPException(status.HTTP_410_GONE, "This hold has expired — please start over at the kiosk")

    copy_res = db.table("book_copies").select("*").eq("id", hold["book_copy_id"]).execute()
    if not copy_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Copy not found")
    copy = copy_res.data[0]

    submitted = body.accession_number.strip().lower()
    actual = (copy["accession_number"] or "").strip().lower()

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

    cfg = get_library_settings(db)
    due_date = (datetime.now(timezone.utc) + timedelta(days=cfg["standard_loan_period_days"])).isoformat()

    loan_res = db.table("loans").insert({
        "book_copy_id": copy["id"],
        "student_id": student_id,
        "station_session_id": hold["station_session_id"],
        "due_date": due_date,
        "condition_at_borrow": body.condition,
        "purpose": body.purpose,
        "notes": body.notes,
    }).execute()
    if not loan_res.data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not create the loan")

    # available -> on_loan: legal per Phase 1's status-machine trigger.
    db.table("book_copies").update({"status": "on_loan"}).eq("id", copy["id"]).execute()

    db.table("soft_holds").delete().eq("id", hold["id"]).execute()

    loan = loan_res.data[0]
    book_res = db.table("books").select("*").eq("id", copy["book_id"]).execute()
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

# Phase 4 — the librarian's primary return-lookup path (build plan 4.1):
# scan or type the exact accession number, find the open loan on that
# specific copy. Two-step lookup (book_copies, then loans) rather than a
# PostgREST embedded-filter — this codebase already got bitten once this
# session by an embed/relationship mismatch, so keep it simple.
@router.get("/lookup", response_model=LoanLookupResult)
def lookup_loan(
    accession_number: str,
    librarian: UserProfile = Depends(require_librarian),
):
    # book_copies has no RLS policy for authenticated callers — not even a
    # librarian's own JWT can read it (see routers/books.py) — so this,
    # like the return/reshelve endpoints below, runs entirely on the admin
    # client. require_librarian already gates the endpoint itself.
    admin = get_admin_client()
    copy_res = admin.table("book_copies").select("id, book_id").eq("accession_number", accession_number.strip()).execute()
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

# Fallback for a damaged/unreadable label (build plan 4.1: "allow search by
# title or borrower name"). Fetches open loans and filters in Python —
# simple, and avoids the embedded-filter/!inner pitfalls that a
# title/name search through two levels of embed would otherwise risk.
@router.get("/search", response_model=list[LoanLookupResult])
def search_loans(
    q: str,
    librarian: UserProfile = Depends(require_librarian),
):
    needle = q.strip().lower()
    if not needle:
        return []

    # Same book_copies RLS constraint as lookup_loan above — admin client
    # throughout, require_librarian gates the endpoint.
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

# Confirm Return (build plan 4.2-4.6): inspect condition, settle any fine,
# close the loan, and route the copy — to the hold shelf if someone's
# waiting for this title, otherwise to For Reshelving. Never straight back
# to Available; that's what the separate reshelving scan is for (4.7).
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

    copy_res = admin.table("book_copies").select("id, book_id").eq("id", loan["book_copy_id"]).execute()
    copy = copy_res.data[0]
    book_res = admin.table("books").select("collection_type").eq("id", copy["book_id"]).execute()
    collection_type = book_res.data[0]["collection_type"] if book_res.data else "General"

    _, overdue_fine = compute_fine(admin, loan["due_date"], collection_type)

    # Damage not present in the student's own declaration is what gets
    # charged (build plan 4.3) — condition already declared at borrow
    # isn't billed again.
    is_new_damage = loan["condition_at_borrow"] == "good" and body.condition_at_return in ("damaged", "incomplete")
    damage_fine = round((body.replacement_cost or 0) + DAMAGE_PROCESSING_FEE, 2) if is_new_damage else 0.0

    total_fine = round(overdue_fine + damage_fine, 2)
    if total_fine > 0 and body.fine_settlement is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"This loan has a ₱{total_fine:.2f} fine — mark it Paid or Unsettled before confirming")
    if body.fine_settlement == "paid" and not body.receipt_number:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A receipt number is required to mark a fine as paid")

    update_res = admin.table("loans").update({
        "returned_at": datetime.now(timezone.utc).isoformat(),
        "status": "returned",
        "condition_at_return": body.condition_at_return,
        "condition_notes": body.condition_notes,
        "fine_amount": total_fine,
        "fine_status": body.fine_settlement if total_fine > 0 else "none",
        "receipt_number": body.receipt_number if body.fine_settlement == "paid" else None,
    }).eq("id", loan_id).execute()
    loan = update_res.data[0]

    # Reservation-aware routing (4.6): first-in-queue for this title, if
    # any, gets the hold shelf instead of the copy going back into general
    # reshelving — goes straight to 'ready' (Phase 5 made this automatic,
    # no librarian pre-approval step) with the specific copy linked so
    # pickup can verify it.
    pending_res = (
        admin.table("reservations")
        .select("id, user_id")
        .eq("book_id", copy["book_id"])
        .eq("status", "pending")
        .order("requested_at")
        .limit(1)
        .execute()
    )

    book_full_res = admin.table("books").select("*").eq("id", copy["book_id"]).execute()
    book_title = book_full_res.data[0]["title"] if book_full_res.data else "A book"

    needs_reshelving = not pending_res.data

    if pending_res.data:
        admin.table("book_copies").update({"status": "reserved"}).eq("id", copy["id"]).execute()
        admin.table("reservations").update({
            "book_copy_id": copy["id"],
            "status": "ready",
            "confirmed_at": datetime.now(timezone.utc).isoformat(),
            "pickup_by": (datetime.now(timezone.utc) + timedelta(days=get_library_settings(admin)["reservation_hold_period_days"])).isoformat(),
        }).eq("id", pending_res.data[0]["id"]).execute()
        notify(
            pending_res.data[0]["user_id"], "reservation_confirmed",
            "Your reserved book is ready for pickup",
            f'"{book_title}" is waiting for you at the LRC counter.',
            link="/student/reservations",
        )
    else:
        admin.table("book_copies").update({"status": "for_reshelving"}).eq("id", copy["id"]).execute()

    notify(
        loan["student_id"], "return_confirmed",
        "Return confirmed",
        f'"{book_title}" has been checked in.' + (f" A ₱{total_fine:.2f} fine was recorded." if total_fine > 0 else ""),
        link="/student/library",
    )
    borrower_res = admin.table("profiles").select("full_name").eq("id", loan["student_id"]).execute()
    borrower_name = borrower_res.data[0]["full_name"] if borrower_res.data else "A student"
    fine_note = f" ₱{total_fine:.2f} fine recorded." if total_fine > 0 else ""

    # Two different follow-up actions depending on where the copy went —
    # each needs its own notification so whoever's on the desk knows which
    # one applies, rather than one generic "returned" message either way.
    if needs_reshelving:
        notify_librarians(
            "Book ready for reshelving",
            f'{borrower_name} returned "{book_title}" — it needs to be walked back to the shelf.{fine_note}',
            link="/librarian/borrow-return?tab=reshelving",
        )
    else:
        notify_librarians(
            "Book returned — held for next reservation",
            f'{borrower_name} returned "{book_title}"; it\'s now on hold for the next reservation.{fine_note}',
            link="/librarian/reservations",
        )

    loan["books"] = book_full_res.data[0] if book_full_res.data else None
    loan["needs_reshelving"] = needs_reshelving

    return loan

# Reshelving tab's browse list (mirrors the Return tab's "Active
# Borrowers") — every copy currently parked at for_reshelving, whether it
# got there through a real return or a guest in-house return, so the
# librarian can pick one instead of needing to already know its accession
# number. Most recently returned first.
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
    # First row per copy is the most recent, since the query above is
    # already ordered — later duplicates for the same copy are ignored.
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

# Reshelving mode (build plan 4.7) — a separate scan, after the book has
# actually been walked back to the shelf. Only this transitions a copy to
# Available; nothing else does, by design.
@router.post("/reshelve", response_model=dict)
def reshelve_copy(
    body: ReshelveRequest,
    librarian: UserProfile = Depends(require_librarian),
):
    admin = get_admin_client()
    copy_res = admin.table("book_copies").select("id, book_id, status").eq("accession_number", body.accession_number.strip()).execute()
    if not copy_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No copy with that accession number")
    copy = copy_res.data[0]
    if copy["status"] != "for_reshelving":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This copy isn't awaiting reshelving")

    admin.table("book_copies").update({"status": "available"}).eq("id", copy["id"]).execute()

    # Closes the loop the same way checkout/return already do — every
    # librarian's activity feed sees the copy actually made it back to the
    # shelf, not just that it was returned to the desk.
    book_res = admin.table("books").select("title").eq("id", copy["book_id"]).execute()
    book_title = book_res.data[0]["title"] if book_res.data else "A book"
    notify_librarians(
        "Book reshelved",
        f'"{book_title}" ({body.accession_number.strip()}) is back on the shelf and available.',
        link="/librarian/borrow-return?tab=reshelving",
    )

    return {"id": copy["id"], "status": "available"}
