from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from core.deps import get_current_user, get_user_supabase, require_librarian
from schemas.auth import UserProfile
from schemas.borrow import BorrowStatus, BorrowTransaction, CreateBorrowRequest

router = APIRouter(prefix="/borrow", tags=["borrow"])

BORROW_PERIOD_DAYS = 14

@router.get("", response_model=list[BorrowTransaction])
def list_borrows(
    status: BorrowStatus | None = None,
    book_id: str | None = None,
    user: UserProfile = Depends(get_current_user),
    db: Client = Depends(get_user_supabase),
):
    # RLS scopes this automatically: patrons see only their own loans,
    # librarians see every transaction. No role branching needed here.
    query = db.table("borrow_transactions").select("*, books(*), profiles(*)")
    if status:
        query = query.eq("status", status)
    if book_id:
        query = query.eq("book_id", book_id)
    res = query.order("borrowed_at", desc=True).execute()
    return res.data

@router.post("", response_model=BorrowTransaction, status_code=status.HTTP_201_CREATED)
def create_borrow(
    body: CreateBorrowRequest,
    librarian: UserProfile = Depends(require_librarian),
    db: Client = Depends(get_user_supabase),
):
    profile_res = db.table("profiles").select("id").eq("email", body.patron_email).execute()
    if not profile_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No patron found with that email")
    patron_id = profile_res.data[0]["id"]

    book_res = db.table("books").select("available_copies").eq("id", body.book_id).execute()
    if not book_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Book not found")

    available = book_res.data[0]["available_copies"] or 0
    if available <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No copies available to borrow")

    due_date = (datetime.now(timezone.utc) + timedelta(days=BORROW_PERIOD_DAYS)).isoformat()
    tx_res = db.table("borrow_transactions").insert({
        "user_id": patron_id,
        "book_id": body.book_id,
        "due_date": due_date,
        "status": "active",
    }).execute()
    if not tx_res.data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not create borrow transaction")

    db.table("books").update({"available_copies": available - 1}).eq("id", body.book_id).execute()

    return tx_res.data[0]

@router.patch("/{transaction_id}/return", response_model=BorrowTransaction)
def return_borrow(
    transaction_id: str,
    librarian: UserProfile = Depends(require_librarian),
    db: Client = Depends(get_user_supabase),
):
    now = datetime.now(timezone.utc).isoformat()
    tx_res = (
        db.table("borrow_transactions")
        .update({"returned_at": now, "status": "returned"})
        .eq("id", transaction_id)
        .eq("status", "active")
        .execute()
    )
    if not tx_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Active borrow transaction not found")

    book_id = tx_res.data[0]["book_id"]
    book_res = db.table("books").select("available_copies").eq("id", book_id).execute()
    if book_res.data:
        available = book_res.data[0]["available_copies"] or 0
        db.table("books").update({"available_copies": available + 1}).eq("id", book_id).execute()

    return tx_res.data[0]
