import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, status

from core.config import FRONTEND_URL
from core.supabase import get_admin_client
from schemas.hold import ClaimHoldRequest, ClaimHoldResponse, HoldDetail, HoldExtendResponse

router = APIRouter(prefix="/holds", tags=["holds"])

# Preview only — the real due date is fixed at loan confirmation (2.7: "the
# due date starts at this moment"), not here.
BORROW_PERIOD_DAYS = 14

# 2.3: "'I'm getting the book' button extends the session to ~5 minutes."
EXTEND_SECONDS = 300

# Phase 3 — Blocking checks (server-side, at claim time)

# These collection types are for library use only and never leave the
# building — matches the build plan's Part 1.3 list exactly.
NON_BORROWABLE_COLLECTION_TYPES = {"Reference", "Thesis", "Capstone", "MTR", "Archives"}

# Placeholder pending a real number from the LRC (open question #2 in the
# build plan) — matches the display-only BORROW_LIMIT_PLACEHOLDER already
# shown to students in apps/web/app/borrow/[token]/page.tsx and
# apps/web/app/student/library/page.tsx. Change here once that's answered.
BORROW_LIMIT = 3

# Not behind auth: claiming happens the instant a student (already
# identified via their open station_session) taps "Borrow this book" —
# there's no separate login step here. get_hold/release below are reached
# from a second, unauthenticated device (the phone that scanned the QR),
# so the token itself is the only credential that can exist for them.

@router.post("", response_model=ClaimHoldResponse, status_code=status.HTTP_201_CREATED)
def claim_hold(body: ClaimHoldRequest):
    db = get_admin_client()

    # claim_copy_for_book only knows book_id + station_session_id — it has
    # no concept of a student, so eligibility has to be decided here,
    # before it ever runs. Rejecting late would lock a copy away from
    # other students for a request that was always going to fail.
    session_res = db.table("station_sessions").select("student_id, ended_at").eq("id", body.station_session_id).execute()
    if not session_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Your session isn't valid — please sign in again")
    session = session_res.data[0]
    if session["ended_at"] is not None:
        raise HTTPException(status.HTTP_410_GONE, "This session has ended — please sign in again")
    student_id = session["student_id"]

    book_res = db.table("books").select("collection_type").eq("id", body.book_id).execute()
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

    if any(loan["book_copies"]["book_id"] == body.book_id for loan in current_loans):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You already have a copy of this title checked out")

    if len(current_loans) >= BORROW_LIMIT:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"You've reached your borrowing limit of {BORROW_LIMIT} books")

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

@router.post("/{token}/extend", response_model=HoldExtendResponse)
def extend_hold(token: str):
    db = get_admin_client()
    hold_res = db.table("soft_holds").select("id, expires_at").eq("token", token).execute()
    if not hold_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This hold doesn't exist or has already been used")
    hold = hold_res.data[0]

    if datetime.fromisoformat(hold["expires_at"]) < datetime.now(timezone.utc):
        db.table("soft_holds").delete().eq("id", hold["id"]).execute()
        raise HTTPException(status.HTTP_410_GONE, "This hold has expired — please start over at the kiosk")

    new_expiry = (datetime.now(timezone.utc) + timedelta(seconds=EXTEND_SECONDS)).isoformat()
    db.table("soft_holds").update({"expires_at": new_expiry}).eq("id", hold["id"]).execute()
    return HoldExtendResponse(expires_at=new_expiry)

# 2.3: "'I can't find it' button flags the copy for librarian attention and
# releases the hold." Flagging means the copy transitions available ->
# missing (legal per the Phase 1 status machine) rather than just
# releasing the hold, which would silently hand the same empty shelf slot
# to the next student who claims this copy.
@router.post("/{token}/report-missing", status_code=status.HTTP_204_NO_CONTENT)
def report_missing(token: str):
    db = get_admin_client()
    hold_res = db.table("soft_holds").select("id, book_copy_id").eq("token", token).execute()
    if not hold_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hold not found")
    hold = hold_res.data[0]

    db.table("book_copies").update({"status": "missing"}).eq("id", hold["book_copy_id"]).execute()
    db.table("soft_holds").delete().eq("id", hold["id"]).execute()
