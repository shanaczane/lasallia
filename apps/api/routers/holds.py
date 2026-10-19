import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, status

from core.config import FRONTEND_URL
from core.loans import (
    COPY_BEING_BORROWED,
    HOLD_GONE,
    NO_COPIES,
    SESSION_ENDED,
    SESSION_INVALID,
    check_borrow_eligibility,
    ensure_initial_copy,
)
from core.notify import notify_librarians
from core.email_template import staff_alert
from core.reservations import maybe_sweep_expired_reservations, promote_next_reservation
from core.settings import get_library_settings
from core.supabase import get_admin_client
from schemas.hold import BorrowEligibility, ClaimHoldRequest, ClaimHoldResponse, HoldDetail, HoldExtendResponse

router = APIRouter(prefix="/holds", tags=["holds"])

# A hold lasts 3 minutes. With 45 seconds or less left, "Add time" resets
# it to 3 minutes, but never past MAX_HOLD_SECONDS from the start.
HOLD_SECONDS = 180
EXTEND_WINDOW_SECONDS = 45
MAX_HOLD_SECONDS = 540


def _hold_deadline(hold: dict) -> datetime:
    return datetime.fromisoformat(hold["created_at"]) + timedelta(seconds=MAX_HOLD_SECONDS)


def _seconds_left(expires_at: datetime | str) -> int:
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    return max(0, int((expires_at - datetime.now(timezone.utc)).total_seconds()))

def _open_session_student(db, station_session_id: str) -> str:
    session_res = db.table("station_sessions").select("student_id, ended_at").eq("id", station_session_id).execute()
    if not session_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, SESSION_INVALID)
    session = session_res.data[0]
    if session["ended_at"] is not None:
        raise HTTPException(status.HTTP_410_GONE, SESSION_ENDED)
    return session["student_id"]


def _availability_problem(db, book_id: str, station_session_id: str) -> str | None:
    """Why no copy can be claimed right now, or None if one can. A copy
    someone else is holding still shows 'available' but can't be claimed."""
    copies = db.table("book_copies").select("id").eq("book_id", book_id).eq("status", "available").execute().data
    if not copies:
        return NO_COPIES
    copy_ids = [c["id"] for c in copies]
    now = datetime.now(timezone.utc).isoformat()
    held = db.table("soft_holds").select("book_copy_id, station_session_id").in_("book_copy_id", copy_ids).gt("expires_at", now).execute().data
    if len({h["book_copy_id"] for h in held}) >= len(copy_ids) and any(h["station_session_id"] != station_session_id for h in held):
        return COPY_BEING_BORROWED
    return None


# No login: the open kiosk session identifies the student. The phone that
# scans the QR code uses the hold token as its credential.

@router.post("", response_model=ClaimHoldResponse, status_code=status.HTTP_201_CREATED)
def claim_hold(body: ClaimHoldRequest):
    db = get_admin_client()
    # Free copies held for expired pickups first.
    maybe_sweep_expired_reservations(db)

    # Check eligibility before holding a copy, so a doomed request doesn't
    # lock one away from others.
    student_id = _open_session_student(db, body.station_session_id)

    check_borrow_eligibility(db, student_id, body.book_id)
    ensure_initial_copy(db, body.book_id)

    token = secrets.token_urlsafe(24)

    # A student with a ready reservation gets the copy set aside for them
    # (it's 'reserved', so the normal search wouldn't find it).
    ready_reservation = (
        db.table("reservations")
        .select("book_copy_id")
        .eq("user_id", student_id)
        .eq("book_id", body.book_id)
        .eq("status", "ready")
        .execute()
    ).data

    if ready_reservation and ready_reservation[0]["book_copy_id"]:
        now = datetime.now(timezone.utc)
        expires_at = (now + timedelta(seconds=HOLD_SECONDS)).isoformat()
        db.table("soft_holds").upsert({
            "book_copy_id": ready_reservation[0]["book_copy_id"],
            "station_session_id": body.station_session_id,
            "token": token,
            "attempt_count": 0,
            "expires_at": expires_at,
            "created_at": now.isoformat(),
        }, on_conflict="book_copy_id").execute()
    else:
        # Release any hold this student left on this book, or it would block
        # their new claim. Matched by student, since each claim gets a new session.
        own_copy_ids = [
            c["id"] for c in
            db.table("book_copies").select("id").eq("book_id", body.book_id).execute().data
        ]
        if own_copy_ids:
            existing = db.table("soft_holds").select("id, station_session_id").in_("book_copy_id", own_copy_ids).execute().data
            if existing:
                session_ids = list({h["station_session_id"] for h in existing})
                mine = {
                    s["id"] for s in
                    db.table("station_sessions").select("id").in_("id", session_ids).eq("student_id", student_id).execute().data
                }
                stale = [h["id"] for h in existing if h["station_session_id"] in mine]
                if stale:
                    db.table("soft_holds").delete().in_("id", stale).execute()

        res = db.rpc("claim_copy_for_book", {
            "p_book_id": body.book_id,
            "p_station_session_id": body.station_session_id,
            "p_token": token,
            "p_ttl_seconds": HOLD_SECONDS,
        }).execute()

        if not res.data:
            raise HTTPException(status.HTTP_409_CONFLICT, _availability_problem(db, body.book_id, body.station_session_id) or NO_COPIES)

        # Reset the times with this server's clock, which every later check
        # uses; the database clock may differ.
        now = datetime.now(timezone.utc)
        expires_at = (now + timedelta(seconds=HOLD_SECONDS)).isoformat()
        try:
            db.table("soft_holds").update({"created_at": now.isoformat(), "expires_at": expires_at}).eq("token", token).execute()
        except Exception:
            # The student only sees an error, so free the copy for their retry.
            db.table("soft_holds").delete().eq("token", token).execute()
            raise

    return ClaimHoldResponse(
        token=token,
        expires_at=expires_at,
        seconds_left=_seconds_left(expires_at),
        qr_url=f"{FRONTEND_URL}/borrow/{token}",
    )

# Runs claim_hold's checks in advance, so the kiosk can explain why a student
# can't borrow. Must come before /{token}, which would match this path.
@router.get("/eligibility", response_model=BorrowEligibility)
def borrow_eligibility(book_id: str, station_session_id: str):
    db = get_admin_client()
    maybe_sweep_expired_reservations(db)
    student_id = _open_session_student(db, station_session_id)

    try:
        check_borrow_eligibility(db, student_id, book_id)
    except HTTPException as e:
        return BorrowEligibility(can_borrow=False, reason=str(e.detail))
    ensure_initial_copy(db, book_id)

    # A ready reservation already has its copy set aside.
    ready = (
        db.table("reservations").select("id")
        .eq("user_id", student_id).eq("book_id", book_id).eq("status", "ready")
        .execute()
    ).data
    if ready:
        return BorrowEligibility(can_borrow=True, reason=None)

    problem = _availability_problem(db, book_id, station_session_id)
    return BorrowEligibility(can_borrow=problem is None, reason=problem)

@router.get("/{token}", response_model=HoldDetail)
def get_hold(token: str):
    db = get_admin_client()

    hold_res = db.table("soft_holds").select("*, book_copies(book_id)").eq("token", token).execute()
    if not hold_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, HOLD_GONE)
    hold = hold_res.data[0]

    if datetime.fromisoformat(hold["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_410_GONE, HOLD_GONE)

    book_id = hold["book_copies"]["book_id"]
    book_res = db.table("books").select("*").eq("id", book_id).execute()
    if not book_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Book not found")
    book = book_res.data[0]
    book["accession_no"] = None  # never shown before the student types it

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
        seconds_left=_seconds_left(hold["expires_at"]),
        can_extend=datetime.fromisoformat(hold["expires_at"]) < _hold_deadline(hold),
        book=book,
        student_first_name=first_name,
        active_loan_count=active_loans.count or 0,
        due_date_preview=due_preview,
    )

@router.post("/{token}/release", status_code=status.HTTP_204_NO_CONTENT)
def release_hold(token: str):
    """The student backed out of borrowing — free the copy right away
    instead of leaving it blocked until the hold times out."""
    db = get_admin_client()
    res = db.table("soft_holds").delete().eq("token", token).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hold not found")
    _hand_on_released_copy(db, res.data[0]["book_copy_id"])


def _hand_on_released_copy(db, copy_id: str) -> None:
    """Gives a released copy to the reservation queue, or leaves it
    available. A copy reserved for this student stays theirs."""
    copy_res = db.table("book_copies").select("id, book_id, status").eq("id", copy_id).execute()
    if not copy_res.data or copy_res.data[0]["status"] != "available":
        return
    copy = copy_res.data[0]
    if promote_next_reservation(db, copy["book_id"], copy["id"]):
        db.table("book_copies").update({"status": "reserved"}).eq("id", copy["id"]).execute()

@router.post("/{token}/extend", response_model=HoldExtendResponse)
def extend_hold(token: str):
    db = get_admin_client()
    hold_res = db.table("soft_holds").select("id, expires_at, created_at").eq("token", token).execute()
    if not hold_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, HOLD_GONE)
    hold = hold_res.data[0]

    now = datetime.now(timezone.utc)
    expires_at = datetime.fromisoformat(hold["expires_at"])
    if expires_at < now:
        db.table("soft_holds").delete().eq("id", hold["id"]).execute()
        raise HTTPException(status.HTTP_410_GONE, HOLD_GONE)

    # Enforced here, not just by when /borrow shows the button.
    if (expires_at - now).total_seconds() > EXTEND_WINDOW_SECONDS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can add time once 45 seconds or less are left")

    deadline = _hold_deadline(hold)
    new_expiry = min(now + timedelta(seconds=HOLD_SECONDS), deadline)
    if new_expiry <= expires_at:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No more time can be added — please start over at the kiosk")

    db.table("soft_holds").update({"expires_at": new_expiry.isoformat()}).eq("id", hold["id"]).execute()
    return HoldExtendResponse(
        expires_at=new_expiry.isoformat(),
        seconds_left=_seconds_left(new_expiry),
        can_extend=new_expiry < deadline,
    )

# "I can't find it": marks the copy missing (not just released), so the
# next student isn't sent to the same empty shelf.
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
        email=staff_alert(
            subject=f"Copy reported missing: {book_title}",
            intro="A student couldn't find a copy on the shelf while trying to borrow it, so it has been flagged as missing.",
            details=[("Title", book_title), ("Accession No.", accession), ("Status", "Missing")],
            action="Please check the shelf. If you find the copy, mark it as found in the catalog.",
            link_label="Open catalog",
            link="/librarian/catalog",
        ),
    )
