import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, status

from core.config import FRONTEND_URL
from core.loans import check_borrow_eligibility
from core.notify import notify_librarians
from core.settings import get_library_settings
from core.supabase import get_admin_client
from schemas.hold import ClaimHoldRequest, ClaimHoldResponse, HoldDetail, HoldExtendResponse

router = APIRouter(prefix="/holds", tags=["holds"])

# 2.3: "'I'm getting the book' button extends the session to ~5 minutes."
EXTEND_SECONDS = 300

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

    check_borrow_eligibility(db, student_id, body.book_id)

    token = secrets.token_urlsafe(24)

    # A student with a 'ready' reservation on this title already has a
    # specific copy pulled and held for them — that copy's status is
    # 'reserved', not 'available', so claim_copy_for_book below would
    # never find it (by design, it only searches general circulation).
    # Route them straight to their own held copy instead of running that
    # search, so "Borrow this book" on the catalog page works the same way
    # for a queued pickup as it does for a walk-in — no separate pickup
    # flow needed.
    ready_reservation = (
        db.table("reservations")
        .select("book_copy_id")
        .eq("user_id", student_id)
        .eq("book_id", body.book_id)
        .eq("status", "ready")
        .execute()
    ).data

    if ready_reservation and ready_reservation[0]["book_copy_id"]:
        expires_at = (datetime.now(timezone.utc) + timedelta(seconds=120)).isoformat()
        db.table("soft_holds").upsert({
            "book_copy_id": ready_reservation[0]["book_copy_id"],
            "station_session_id": body.station_session_id,
            "token": token,
            "attempt_count": 0,
            "expires_at": expires_at,
        }, on_conflict="book_copy_id").execute()
    else:
        res = db.rpc("claim_copy_for_book", {
            "p_book_id": body.book_id,
            "p_station_session_id": body.station_session_id,
            "p_token": token,
        }).execute()

        if not res.data:
            raise HTTPException(status.HTTP_409_CONFLICT, "No copies available to borrow right now")

        expires_at = res.data[0]["expires_at"]

    return ClaimHoldResponse(
        token=token,
        expires_at=expires_at,
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

    cfg = get_library_settings(db)
    due_preview = (datetime.now(timezone.utc) + timedelta(days=cfg["standard_loan_period_days"])).isoformat()

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

    copy_res = db.table("book_copies").select("book_id, accession_number").eq("id", hold["book_copy_id"]).execute()
    book_title, accession = "A book", None
    if copy_res.data:
        accession = copy_res.data[0]["accession_number"]
        book_res = db.table("books").select("title").eq("id", copy_res.data[0]["book_id"]).execute()
        if book_res.data:
            book_title = book_res.data[0]["title"]
    notify_librarians(
        "Copy reported missing",
        f'A student couldn\'t find "{book_title}"{f" ({accession})" if accession else ""} on the shelf — it\'s now flagged missing.',
        link="/librarian/catalog",
    )
