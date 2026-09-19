from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from core.accession import normalize_accession_number
from core.calendar import compute_fine
from core.deps import get_current_user, get_user_supabase, require_librarian
from core.loans import check_borrow_eligibility, create_loan_and_notify
from core.notify import notify, notify_librarians
from core.reservations import promote_next_reservation
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
    # profiles!loans_student_id_fkey, not bare profiles(...) — migration
    # 0028 added loans.assisted_by as a second FK to profiles, so an
    # unqualified embed is ambiguous and PostgREST 400s the whole query.
    # The borrower is always student_id; assisted_by is a separate,
    # optional audit field nothing here reads back out.
    return query.select("*, book_copies(book_id, accession_number, books(*)), profiles!loans_student_id_fkey(full_name, avatar_url)")


def _flatten_loan(loan: dict) -> dict:
    copy = loan.pop("book_copies", None)
    loan["books"] = copy["books"] if copy else None
    loan["accession_number"] = copy["accession_number"] if copy else None
    return loan


@router.get("", response_model=list[Loan])
def list_loans(
    student_id: str | None = None,
    # Day-scoped views (Borrow & Return's "Borrowed/Returned Today" lists) —
    # the caller computes the local-day boundary and passes it as an ISO
    # timestamp, rather than this endpoint guessing a timezone server-side.
    borrowed_from: str | None = None,
    borrowed_to: str | None = None,
    returned_from: str | None = None,
    returned_to: str | None = None,
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

    loan = create_loan_and_notify(
        db, student_id, copy["id"], copy["book_id"], hold["station_session_id"],
        body.condition, body.purpose, body.notes,
    )

    db.table("soft_holds").delete().eq("id", hold["id"]).execute()

    return loan

# Desk-side checkout (build plan Phase 1's `librarian_assisted` dual-auth,
# finally wired into borrowing): the librarian already has the physical
# book in hand, so there's no walk-to-the-shelf gap for a soft_hold to
# cover. station_session_id must point at an 'rfid' session opened at the
# librarian's own reader (routers/sessions.py already treats any rfid tap
# identically regardless of who operates the reader), and accession_number
# identifies the exact copy directly — no auto-pick, no separate "type it
# again to confirm" step, since scanning it here already proves possession.
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

    # A 'reserved' copy is borrowable only when it's this exact student's own
    # ready pickup (holds.py's claim_hold gives the digital kiosk flow the
    # same allowance) — anyone else's hold on it still blocks the checkout.
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
    book_full_res = admin.table("books").select("*").eq("id", copy["book_id"]).execute()
    book_title = book_full_res.data[0]["title"] if book_full_res.data else "A book"

    promoted = promote_next_reservation(admin, copy["book_id"], copy["id"])
    needs_reshelving = not promoted
    admin.table("book_copies").update(
        {"status": "reserved" if promoted else "for_reshelving"}
    ).eq("id", copy["id"]).execute()

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

# Patrons > Fines tab: a fine left "unsettled" at return time can be paid
# later, at the desk, with no book involved — the loan itself is already
# closed, so this only ever touches fine_status/receipt_number, never the
# copy or notifications tied to the return itself. Not a payment gateway:
# this records that the librarian already collected payment in person,
# same as return_loan's own fine_settlement field does at return time.
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
        link="/student/library",
    )

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
    copy_res = admin.table("book_copies").select("id, book_id, status").eq("accession_number", normalize_accession_number(body.accession_number)).execute()
    if not copy_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No copy with that accession number")
    copy = copy_res.data[0]
    if copy["status"] != "for_reshelving":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This copy isn't awaiting reshelving")

    # A reservation can form after a copy already landed in for_reshelving
    # (the book shows as "borrowed" the whole time it sits here, so a
    # student joining the queue is exactly the expected move) — re-check
    # before opening this copy back up to anyone, so a walk-in can't grab
    # it out from under someone who's been waiting in line.
    promoted = promote_next_reservation(admin, copy["book_id"], copy["id"])
    admin.table("book_copies").update({
        "status": "reserved" if promoted else "available",
        # Recorded regardless of which status it lands on — this is a log of
        # the reshelving scan itself (Borrow & Return's "Reshelved Today"
        # list), not of the copy's current shelf availability.
        "reshelved_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", copy["id"]).execute()

    # Closes the loop the same way checkout/return already do — every
    # librarian's activity feed sees the copy actually made it back to the
    # shelf, not just that it was returned to the desk.
    book_res = admin.table("books").select("title").eq("id", copy["book_id"]).execute()
    book_title = book_res.data[0]["title"] if book_res.data else "A book"
    if promoted:
        notify_librarians(
            "Book reshelved — held for next reservation",
            f'"{book_title}" ({body.accession_number.strip()}) is on hold for the next reservation instead of going back on the shelf.',
            link="/librarian/reservations",
        )
        return {"id": copy["id"], "status": "reserved"}

    notify_librarians(
        "Book reshelved",
        f'"{book_title}" ({body.accession_number.strip()}) is back on the shelf and available.',
        link="/librarian/borrow-return?tab=reshelving",
    )
    return {"id": copy["id"], "status": "available"}

# Reshelving tab's "Reshelved Today" list — mirrors Borrow/Return's own
# day-scoped views (GET /loans's borrowed_from/returned_from). Same
# caller-computes-the-local-day-boundary convention as those.
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
