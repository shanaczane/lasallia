import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError

from core.accession import normalize_accession_number
from core.calendar import HOURLY_FINE_COLLECTION_TYPES, loan_due_date
from core.config import FRONTEND_URL
from core.deps import get_current_user, get_optional_user
from core.email_template import staff_alert
from core.holds import (
    WRONG_ACCESSION,
    WRONG_ID_TAP,
    get_live_hold,
    hand_on_released_copy,
    hold_timers,
    loan_for_hold_token,
    record_failed_attempt,
    require_borrower,
    seconds_left as _seconds_left,
)
from core.loans import (
    COPY_BEING_BORROWED,
    NO_COPIES,
    SESSION_ENDED,
    SESSION_INVALID,
    check_borrow_eligibility,
    create_loan_and_notify,
    ensure_initial_copy,
)
from core.notify import notify_librarians
from core.reservations import maybe_sweep_expired_reservations
from core.settings import get_library_settings
from core.supabase import get_admin_client
from schemas.auth import UserProfile
from schemas.hold import (
    BorrowEligibility,
    ClaimHoldRequest,
    ClaimHoldResponse,
    ConfirmTapRequest,
    HoldDetail,
    HoldExtendResponse,
    HoldStatus,
    ReleaseHoldRequest,
    VerifyHoldRequest,
)

router = APIRouter(prefix="/holds", tags=["holds"])

# The hold timers (length, "Add time" window, longest hold) and the time
# allowed for the second kiosk tap are set in Library Settings.


def _hold_deadline(hold: dict, max_seconds: int) -> datetime:
    return datetime.fromisoformat(hold["created_at"]) + timedelta(seconds=max_seconds)


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
# scans the QR code must then sign in as that same student.

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
    hold_seconds, _, _ = hold_timers(get_library_settings(db))

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
        expires_at = (now + timedelta(seconds=hold_seconds)).isoformat()
        db.table("soft_holds").upsert({
            "book_copy_id": ready_reservation[0]["book_copy_id"],
            "station_session_id": body.station_session_id,
            "token": token,
            "attempt_count": 0,
            "expires_at": expires_at,
            "created_at": now.isoformat(),
            "verified_at": None,
            "pending_condition": None,
            "pending_purpose": None,
            "pending_notes": None,
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
            "p_ttl_seconds": hold_seconds,
        }).execute()

        if not res.data:
            raise HTTPException(status.HTTP_409_CONFLICT, _availability_problem(db, body.book_id, body.station_session_id) or NO_COPIES)

        # Reset the times with this server's clock, which every later check
        # uses; the database clock may differ. The claim function can reuse
        # an expired hold's row, so clear what its phone had sent too.
        now = datetime.now(timezone.utc)
        expires_at = (now + timedelta(seconds=hold_seconds)).isoformat()
        try:
            db.table("soft_holds").update({
                "created_at": now.isoformat(),
                "expires_at": expires_at,
                "attempt_count": 0,
                "verified_at": None,
                "pending_condition": None,
                "pending_purpose": None,
                "pending_notes": None,
            }).eq("token", token).execute()
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


# The borrow form on the phone. Only the borrower, signed in, can open it.
@router.get("/{token}", response_model=HoldDetail)
def get_hold(token: str, user: UserProfile = Depends(get_current_user)):
    db = get_admin_client()
    hold = get_live_hold(db, token)
    require_borrower(db, hold, user.id)

    copy_res = db.table("book_copies").select("book_id").eq("id", hold["book_copy_id"]).execute()
    book_res = db.table("books").select("*").eq("id", copy_res.data[0]["book_id"]).execute() if copy_res.data else None
    if not book_res or not book_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Book not found")
    book = book_res.data[0]
    book["accession_no"] = None  # never shown before the student types it

    profile_res = db.table("profiles").select("full_name").eq("id", hold["student_id"]).execute()
    full_name = (profile_res.data[0]["full_name"] if profile_res.data else None) or ""
    first_name = full_name.split(" ")[0] or "there"

    active_loans = (
        db.table("loans")
        .select("id", count="exact")
        .eq("student_id", hold["student_id"])
        .eq("status", "active")
        .execute()
    )

    cfg = get_library_settings(db)
    hold_seconds, window, max_seconds = hold_timers(cfg)
    collection_type = book.get("collection_type")
    due_preview = loan_due_date(db, datetime.now(timezone.utc), cfg, collection_type).isoformat()
    hourly = collection_type in HOURLY_FINE_COLLECTION_TYPES

    return HoldDetail(
        token=token,
        expires_at=hold["expires_at"],
        seconds_left=_seconds_left(hold["expires_at"]),
        can_extend=datetime.fromisoformat(hold["expires_at"]) < _hold_deadline(hold, max_seconds),
        book=book,
        student_first_name=first_name,
        active_loan_count=active_loans.count or 0,
        due_date_preview=due_preview,
        borrow_limit=cfg["max_books_per_borrower"],
        loan_period_days=cfg["reserve_loan_period_days"] if hourly else cfg["standard_loan_period_days"],
        hold_duration_seconds=hold_seconds,
        extend_window_seconds=window,
        needs_kiosk_tap=hold["needs_kiosk_tap"],
        awaiting_tap=hold.get("verified_at") is not None,
    )


# Where a borrow is up to. The kiosk asks with its session id (it has no
# login); the phone asks signed in as the borrower.
@router.get("/{token}/status", response_model=HoldStatus)
def hold_status(
    token: str,
    station_session_id: str | None = None,
    caller: UserProfile | None = Depends(get_optional_user),
):
    db = get_admin_client()

    def allowed(session_id: str | None, student_id: str | None) -> bool:
        return (station_session_id is not None and station_session_id == session_id) or (
            caller is not None and caller.id == student_id
        )

    loan = loan_for_hold_token(db, token)
    if loan:
        if not allowed(loan["station_session_id"], loan["student_id"]):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your borrow")
        return HoldStatus(status="borrowed", due_date=loan["due_date"])

    try:
        hold = get_live_hold(db, token)
    except HTTPException as e:
        if e.status_code in (status.HTTP_404_NOT_FOUND, status.HTTP_410_GONE):
            return HoldStatus(status="gone")
        raise
    if not allowed(hold["station_session_id"], hold["student_id"]):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your borrow")
    return HoldStatus(
        status="awaiting_tap" if hold.get("verified_at") else "waiting",
        seconds_left=_seconds_left(hold["expires_at"]),
    )


# The phone checks the number on the book's label. A web-portal borrow
# becomes a loan right away; a kiosk borrow waits for the second ID tap.
@router.post("/{token}/verify", response_model=HoldStatus)
def verify_hold(token: str, body: VerifyHoldRequest, user: UserProfile = Depends(get_current_user)):
    db = get_admin_client()

    # Already borrowed (e.g. "Try again" after a dropped reply): say so.
    existing = loan_for_hold_token(db, token)
    if existing and existing["student_id"] == user.id:
        return HoldStatus(status="borrowed", due_date=existing["due_date"])

    hold = get_live_hold(db, token)
    require_borrower(db, hold, user.id)

    copy_res = db.table("book_copies").select("*").eq("id", hold["book_copy_id"]).execute()
    if not copy_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Copy not found")
    copy = copy_res.data[0]

    submitted = normalize_accession_number(body.accession_number).lower()
    actual = normalize_accession_number(copy["accession_number"] or "").lower()
    if submitted != actual:
        record_failed_attempt(
            db, hold, WRONG_ACCESSION, status.HTTP_400_BAD_REQUEST,
            "That number belongs to a different book. Please check the label.",
        )

    if hold["needs_kiosk_tap"]:
        cfg = get_library_settings(db)
        now = datetime.now(timezone.utc)
        # Always leave enough time to walk back and tap.
        expires_at = max(
            datetime.fromisoformat(hold["expires_at"]),
            now + timedelta(seconds=cfg["kiosk_tap_confirm_seconds"]),
        )
        db.table("soft_holds").update({
            "verified_at": now.isoformat(),
            "expires_at": expires_at.isoformat(),
            "pending_condition": body.condition,
            "pending_purpose": body.purpose,
            "pending_notes": body.notes,
        }).eq("id", hold["id"]).execute()
        return HoldStatus(status="awaiting_tap", seconds_left=_seconds_left(expires_at))

    loan = _create_loan(db, hold, copy, body.condition, body.purpose, body.notes, token)
    return HoldStatus(status="borrowed", due_date=loan["due_date"])


# The second ID tap at the kiosk, which creates the loan. No login: the
# kiosk session id and the tapped ID are the proof.
@router.post("/{token}/confirm-tap", response_model=HoldStatus)
def confirm_tap(token: str, body: ConfirmTapRequest):
    db = get_admin_client()

    existing = loan_for_hold_token(db, token)
    if existing and existing["station_session_id"] == body.station_session_id:
        return HoldStatus(status="borrowed", due_date=existing["due_date"])

    hold = get_live_hold(db, token)
    if hold["station_session_id"] != body.station_session_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This borrow was started on another kiosk session")
    if not hold.get("verified_at"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Finish on your phone first, then tap your ID")

    tapped = db.table("profiles").select("id").eq("rfid_uid", body.rfid_uid).execute().data
    if not tapped or tapped[0]["id"] != hold["student_id"]:
        record_failed_attempt(
            db, hold, WRONG_ID_TAP, status.HTTP_403_FORBIDDEN,
            "That ID doesn't match the borrower. Tap the same ID you started with.",
        )

    copy_res = db.table("book_copies").select("*").eq("id", hold["book_copy_id"]).execute()
    if not copy_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Copy not found")
    loan = _create_loan(
        db, hold, copy_res.data[0],
        hold.get("pending_condition") or "good", hold.get("pending_purpose"), hold.get("pending_notes"), token,
    )
    return HoldStatus(status="borrowed", due_date=loan["due_date"])


def _create_loan(db, hold: dict, copy: dict, condition: str, purpose: str | None, notes: str | None, token: str) -> dict:
    try:
        loan = create_loan_and_notify(
            db, hold["student_id"], copy["id"], copy["book_id"], hold["station_session_id"],
            condition, purpose, notes, hold_token=token,
        )
    except APIError as e:
        # Two confirms arrived at once and the other one won; use its loan.
        if e.code == "23505":
            existing = loan_for_hold_token(db, token)
            if existing:
                return existing
        raise
    db.table("soft_holds").delete().eq("id", hold["id"]).execute()
    return loan


# The student backed out: free the copy now instead of at the timeout. The
# kiosk sends its session id; the phone is signed in as the borrower.
@router.post("/{token}/release", status_code=status.HTTP_204_NO_CONTENT)
def release_hold(
    token: str,
    body: ReleaseHoldRequest | None = None,
    caller: UserProfile | None = Depends(get_optional_user),
):
    db = get_admin_client()
    res = db.table("soft_holds").select("id, book_copy_id, station_session_id").eq("token", token).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hold not found")
    hold = res.data[0]

    from_kiosk = body is not None and body.station_session_id == hold["station_session_id"]
    if not from_kiosk:
        session = db.table("station_sessions").select("student_id").eq("id", hold["station_session_id"]).execute().data
        if caller is None or not session or session[0]["student_id"] != caller.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your borrow")

    db.table("soft_holds").delete().eq("id", hold["id"]).execute()
    hand_on_released_copy(db, hold["book_copy_id"])


@router.post("/{token}/extend", response_model=HoldExtendResponse)
def extend_hold(token: str, user: UserProfile = Depends(get_current_user)):
    db = get_admin_client()
    hold = get_live_hold(db, token)
    require_borrower(db, hold, user.id)

    hold_seconds, window, max_seconds = hold_timers(get_library_settings(db))
    now = datetime.now(timezone.utc)
    expires_at = datetime.fromisoformat(hold["expires_at"])

    # Enforced here, not just by when /borrow shows the button.
    if (expires_at - now).total_seconds() > window:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"You can add time once {window} seconds or less are left")

    deadline = _hold_deadline(hold, max_seconds)
    new_expiry = min(now + timedelta(seconds=hold_seconds), deadline)
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
def report_missing(token: str, user: UserProfile = Depends(get_current_user)):
    db = get_admin_client()
    hold = get_live_hold(db, token)
    require_borrower(db, hold, user.id)

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
