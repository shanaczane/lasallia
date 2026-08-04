from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from core.deps import get_current_user, get_user_supabase
from core.supabase import get_admin_client
from schemas.auth import UserProfile
from schemas.loan import ConfirmLoanRequest, Loan

router = APIRouter(prefix="/loans", tags=["loans"])

BORROW_PERIOD_DAYS = 14
MAX_ATTEMPTS = 3

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
