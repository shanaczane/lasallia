from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from core.calendar import count_library_hours, count_school_days
from core.deps import get_current_user, get_user_supabase, require_librarian
from core.supabase import get_admin_client
from schemas.auth import UserProfile
from schemas.loan import ConfirmLoanRequest, Loan, LoanLookupResult, ReshelveRequest, ReturnLoanRequest

router = APIRouter(prefix="/loans", tags=["loans"])

BORROW_PERIOD_DAYS = 14
MAX_ATTEMPTS = 3

# Phase 4 — hourly-rate collection types (build plan 4.4). Everything else
# is general circulation, charged per school day.
HOURLY_FINE_COLLECTION_TYPES = {"Reserve", "Story book", "Bible"}
DAILY_FINE_RATE = 5.0
HOURLY_FINE_RATE = 2.0
DAMAGE_PROCESSING_FEE = 50.0

# Reused by both the return endpoint's reservation routing and
# reservations.py's own librarian-confirm action.
PICKUP_WINDOW_DAYS = 3


def _embed_book_and_borrower(db: Client, query):
    return query.select("*, book_copies(book_id, accession_number, books(*)), profiles(full_name, avatar_url)")


def _flatten_loan(loan: dict) -> dict:
    copy = loan.pop("book_copies", None)
    loan["books"] = copy["books"] if copy else None
    loan["accession_number"] = copy["accession_number"] if copy else None
    return loan


def _compute_fine(db: Client, due_date_iso: str, collection_type: str) -> tuple[int, float]:
    """Returns (days_overdue, fine_amount) for an open loan, as of now.
    days_overdue is always day-based (for display); fine_amount uses
    whichever rate applies to the collection type."""
    due_date = datetime.fromisoformat(due_date_iso)
    now = datetime.now(timezone.utc)
    days_overdue = count_school_days(db, due_date, now)
    if days_overdue == 0:
        return 0, 0.0
    if collection_type in HOURLY_FINE_COLLECTION_TYPES:
        fine = round(count_library_hours(db, due_date, now) * HOURLY_FINE_RATE, 2)
    else:
        fine = round(days_overdue * DAILY_FINE_RATE, 2)
    return days_overdue, fine

@router.get("", response_model=list[Loan])
def list_loans(
    user: UserProfile = Depends(get_current_user),
    db: Client = Depends(get_user_supabase),
):
    # RLS scopes this automatically (0009): students see only their own
    # loans, librarians see every loan.
    #
    # loans has no direct FK to books — only to book_copies, which in turn
    # points at books — so the embed has to go through book_copies and get
    # flattened back onto `books` to match the Loan schema's shape (which
    # mirrors what confirm_loan already returns after inserting a loan).
    res = db.table("loans").select("*, book_copies(books(*))").order("borrowed_at", desc=True).execute()
    loans = res.data
    for loan in loans:
        copy = loan.pop("book_copies", None)
        loan["books"] = copy["books"] if copy else None

    # "overdue" is never written back by anything yet (no return flow, no
    # cron) — a loan whose due_date has passed still says status: "active"
    # in the row. Recompute it here for display rather than trust the
    # stored value, same reasoning as catalog availability.
    now = datetime.now(timezone.utc)
    for loan in loans:
        if loan["status"] == "active" and datetime.fromisoformat(loan["due_date"]) < now:
            loan["status"] = "overdue"

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

    due_date = (datetime.now(timezone.utc) + timedelta(days=BORROW_PERIOD_DAYS)).isoformat()

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
    db: Client = Depends(get_user_supabase),
):
    copy_res = db.table("book_copies").select("id, book_id").eq("accession_number", accession_number.strip()).execute()
    if not copy_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No copy with that accession number")
    copy = copy_res.data[0]

    loan_res = (
        _embed_book_and_borrower(db, db.table("loans"))
        .eq("book_copy_id", copy["id"])
        .in_("status", ["active", "overdue"])
        .execute()
    )
    if not loan_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This copy isn't currently out on loan")
    loan = _flatten_loan(loan_res.data[0])

    book_res = db.table("books").select("collection_type").eq("id", copy["book_id"]).execute()
    collection_type = book_res.data[0]["collection_type"] if book_res.data else "General"
    days_overdue, preview_fine = _compute_fine(db, loan["due_date"], collection_type)

    return LoanLookupResult(**loan, days_overdue=days_overdue, preview_fine_amount=preview_fine)

# Fallback for a damaged/unreadable label (build plan 4.1: "allow search by
# title or borrower name"). Fetches open loans and filters in Python —
# simple, and avoids the embedded-filter/!inner pitfalls that a
# title/name search through two levels of embed would otherwise risk.
@router.get("/search", response_model=list[LoanLookupResult])
def search_loans(
    q: str,
    librarian: UserProfile = Depends(require_librarian),
    db: Client = Depends(get_user_supabase),
):
    needle = q.strip().lower()
    if not needle:
        return []

    loans_res = (
        _embed_book_and_borrower(db, db.table("loans"))
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
        days_overdue, preview_fine = _compute_fine(db, loan["due_date"], book.get("collection_type") or "General")
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

    _, overdue_fine = _compute_fine(admin, loan["due_date"], collection_type)

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
    # reshelving. Doesn't build the pickup flow itself (accession-number
    # verification at pickup, hold-shelf expiry) — that's Phase 5.
    pending_res = (
        admin.table("reservations")
        .select("id")
        .eq("book_id", copy["book_id"])
        .eq("status", "pending")
        .order("requested_at")
        .limit(1)
        .execute()
    )
    if pending_res.data:
        admin.table("book_copies").update({"status": "reserved"}).eq("id", copy["id"]).execute()
        admin.table("reservations").update({
            "status": "confirmed",
            "confirmed_at": datetime.now(timezone.utc).isoformat(),
            "pickup_by": (datetime.now(timezone.utc) + timedelta(days=PICKUP_WINDOW_DAYS)).isoformat(),
        }).eq("id", pending_res.data[0]["id"]).execute()
    else:
        admin.table("book_copies").update({"status": "for_reshelving"}).eq("id", copy["id"]).execute()

    book_full_res = admin.table("books").select("*").eq("id", copy["book_id"]).execute()
    loan["books"] = book_full_res.data[0] if book_full_res.data else None

    return loan

# Reshelving mode (build plan 4.7) — a separate scan, after the book has
# actually been walked back to the shelf. Only this transitions a copy to
# Available; nothing else does, by design.
@router.post("/reshelve", response_model=dict)
def reshelve_copy(
    body: ReshelveRequest,
    librarian: UserProfile = Depends(require_librarian),
):
    admin = get_admin_client()
    copy_res = admin.table("book_copies").select("id, status").eq("accession_number", body.accession_number.strip()).execute()
    if not copy_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No copy with that accession number")
    copy = copy_res.data[0]
    if copy["status"] != "for_reshelving":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This copy isn't awaiting reshelving")

    admin.table("book_copies").update({"status": "available"}).eq("id", copy["id"]).execute()
    return {"id": copy["id"], "status": "available"}
