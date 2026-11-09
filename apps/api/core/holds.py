# Rules for a borrow hold (the copy set aside while a student borrows it).
#
# Only the borrower can use a hold: the phone that opens the QR link must be
# signed in to the same account as the ID that was tapped. Anyone else who
# scans it is turned away without touching the hold, so a stray scan can't
# cancel someone's borrow. Typing the wrong accession number or tapping a
# different ID at the kiosk each count as a wrong attempt. After MAX_ATTEMPTS
# the hold is cancelled and the librarians are told.

from datetime import datetime, timezone

from fastapi import HTTPException, status

from core.email_template import staff_alert
from core.loans import HOLD_GONE
from core.notify import notify_librarians
from core.reservations import promote_next_reservation

MAX_ATTEMPTS = 3

WRONG_ACCESSION = "wrong_accession"
WRONG_ID_TAP = "wrong_id_tap"

_REASON_LABELS = {
    WRONG_ACCESSION: "the wrong accession number was typed",
    WRONG_ID_TAP: "a different ID was tapped at the kiosk",
}


def hold_timers(cfg: dict) -> tuple[int, int, int]:
    """(hold length, "Add time" window, longest a hold can last), in seconds."""
    return cfg["hold_duration_seconds"], cfg["hold_extend_window_seconds"], cfg["hold_max_seconds"]


def seconds_left(expires_at: datetime | str) -> int:
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    return max(0, int((expires_at - datetime.now(timezone.utc)).total_seconds()))


def get_live_hold(db, token: str) -> dict:
    """The hold for this token, with its borrower (student_id) and whether
    it needs a second ID tap at the kiosk (needs_kiosk_tap). An expired
    hold is removed and treated as gone."""
    res = db.table("soft_holds").select("*").eq("token", token).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, HOLD_GONE)
    hold = res.data[0]
    if datetime.fromisoformat(hold["expires_at"]) < datetime.now(timezone.utc):
        db.table("soft_holds").delete().eq("id", hold["id"]).execute()
        hand_on_released_copy(db, hold["book_copy_id"])
        raise HTTPException(status.HTTP_410_GONE, HOLD_GONE)

    session = (
        db.table("station_sessions").select("student_id, auth_method")
        .eq("id", hold["station_session_id"]).execute()
    ).data
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, HOLD_GONE)
    hold["student_id"] = session[0]["student_id"]
    # Kiosk sessions start with an ID tap; web-portal ones with a login.
    hold["needs_kiosk_tap"] = session[0]["auth_method"] == "rfid"
    return hold


def require_borrower(db, hold: dict, user_id: str) -> None:
    """Stops anyone but the borrower from using the hold. Not counted as a
    wrong attempt: the token is unguessable, and counting would let anyone
    who glimpses the QR code cancel the borrow just by scanning it."""
    if user_id != hold["student_id"]:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "This borrow belongs to another account. Sign in with the account of the ID that was tapped.",
        )


def record_failed_attempt(db, hold: dict, reason: str, code: int, message: str) -> None:
    """Counts a wrong attempt and always raises. The last allowed attempt
    cancels the hold and tells the librarians."""
    attempts = (hold.get("attempt_count") or 0) + 1
    if attempts >= MAX_ATTEMPTS:
        cancel_hold(db, hold, reason)
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Too many wrong attempts — this borrow was cancelled. Please see the librarian.",
        )
    db.table("soft_holds").update({"attempt_count": attempts}).eq("id", hold["id"]).execute()
    remaining = MAX_ATTEMPTS - attempts
    raise HTTPException(code, f"{message} ({remaining} attempt{'s' if remaining != 1 else ''} left)")


def cancel_hold(db, hold: dict, reason: str) -> None:
    db.table("soft_holds").delete().eq("id", hold["id"]).execute()
    hand_on_released_copy(db, hold["book_copy_id"])

    copy = (
        db.table("book_copies").select("accession_number, books(title)")
        .eq("id", hold["book_copy_id"]).execute()
    ).data
    title = (copy[0].get("books") or {}).get("title") if copy else None
    title = title or "A book"
    accession = copy[0]["accession_number"] if copy else None
    profile = db.table("profiles").select("full_name").eq("id", hold.get("student_id")).execute().data if hold.get("student_id") else []
    borrower = (profile[0]["full_name"] if profile else None) or "a student"
    why = _REASON_LABELS.get(reason, "too many wrong attempts")

    notify_librarians(
        "Kiosk borrow cancelled",
        f'Borrowing "{title}" for {borrower} was cancelled after {MAX_ATTEMPTS} wrong attempts (last one: {why}).',
        link="/librarian/borrow-return",
        email=staff_alert(
            subject=f"Kiosk borrow cancelled: {title}",
            intro=f"A kiosk borrow was cancelled after {MAX_ATTEMPTS} wrong attempts. Someone other than the borrower may have scanned the QR code.",
            details=[
                ("Borrower", borrower),
                ("Title", title),
                ("Accession No.", accession),
                ("Last attempt", why),
            ],
            action="No loan was created and the copy is free again. You may want to check with the borrower.",
            link_label="View Borrow & Return",
            link="/librarian/borrow-return",
        ),
    )


def hand_on_released_copy(db, copy_id: str) -> None:
    """Gives a released copy to the reservation queue, or leaves it
    available. A copy reserved for this student stays theirs."""
    copy_res = db.table("book_copies").select("id, book_id, status").eq("id", copy_id).execute()
    if not copy_res.data or copy_res.data[0]["status"] != "available":
        return
    copy = copy_res.data[0]
    if promote_next_reservation(db, copy["book_id"], copy["id"]):
        db.table("book_copies").update({"status": "reserved"}).eq("id", copy["id"]).execute()


def loan_for_hold_token(db, token: str) -> dict | None:
    """The loan a hold was already turned into, if any."""
    res = (
        db.table("loans")
        .select("*, book_copies(book_id, accession_number, books(*)), profiles!loans_student_id_fkey(full_name, avatar_url)")
        .eq("hold_token", token).execute()
    )
    if not res.data:
        return None
    loan = res.data[0]
    copy = loan.pop("book_copies", None)
    loan["books"] = copy["books"] if copy else None
    loan["accession_number"] = copy["accession_number"] if copy else None
    return loan
