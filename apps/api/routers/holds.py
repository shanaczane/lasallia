import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, status

from core.config import FRONTEND_URL
from core.supabase import get_admin_client
from schemas.hold import ClaimHoldRequest, ClaimHoldResponse, HoldDetail

router = APIRouter(prefix="/holds", tags=["holds"])

# Preview only — the real due date is fixed at loan confirmation (2.7: "the
# due date starts at this moment"), not here.
BORROW_PERIOD_DAYS = 14

# Not behind auth: claiming happens the instant a student (already
# identified via their open station_session) taps "Borrow this book" —
# there's no separate login step here. get_hold/release below are reached
# from a second, unauthenticated device (the phone that scanned the QR),
# so the token itself is the only credential that can exist for them.

@router.post("", response_model=ClaimHoldResponse, status_code=status.HTTP_201_CREATED)
def claim_hold(body: ClaimHoldRequest):
    db = get_admin_client()
    token = secrets.token_urlsafe(24)

    res = db.rpc("claim_copy_for_book", {
        "p_book_id": body.book_id,
        "p_station_session_id": body.station_session_id,
        "p_token": token,
    }).execute()

    if not res.data:
        raise HTTPException(status.HTTP_409_CONFLICT, "No copies available to borrow right now")

    claimed = res.data[0]
    return ClaimHoldResponse(
        token=token,
        expires_at=claimed["expires_at"],
        qr_url=f"{FRONTEND_URL}/borrow/{token}",
    )

@router.get("/{token}", response_model=HoldDetail)
def get_hold(token: str):
    db = get_admin_client()

    hold_res = db.table("soft_holds").select("*, book_copies(book_id)").eq("token", token).execute()
    if not hold_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This hold doesn't exist or has already been used")
    hold = hold_res.data[0]

    if datetime.fromisoformat(hold["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_410_GONE, "This hold has expired — please start over at the kiosk")

    book_id = hold["book_copies"]["book_id"]
    book_res = db.table("books").select("*").eq("id", book_id).execute()
    if not book_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Book not found")
    book = book_res.data[0]
    book["accession_no"] = None  # never shown before it's typed — see routers/books.py

    session_res = db.table("station_sessions").select("student_id").eq("id", hold["station_session_id"]).execute()
    student_id = session_res.data[0]["student_id"]
    profile_res = db.table("profiles").select("full_name").eq("id", student_id).execute()
    full_name = (profile_res.data[0]["full_name"] if profile_res.data else None) or ""
    first_name = full_name.split(" ")[0] or "there"

    active_loans = (
        db.table("loans")
        .select("id", count="exact")
        .eq("student_id", student_id)
        .eq("status", "active")
        .execute()
    )

    due_preview = (datetime.now(timezone.utc) + timedelta(days=BORROW_PERIOD_DAYS)).isoformat()

    return HoldDetail(
        token=token,
        expires_at=hold["expires_at"],
        book=book,
        student_first_name=first_name,
        active_loan_count=active_loans.count or 0,
        due_date_preview=due_preview,
    )

@router.post("/{token}/release", status_code=status.HTTP_204_NO_CONTENT)
def release_hold(token: str):
    db = get_admin_client()
    res = db.table("soft_holds").delete().eq("token", token).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hold not found")
