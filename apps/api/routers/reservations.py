from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from core.deps import get_current_user, get_user_supabase
from core.notify import notify, notify_librarians
from core.email_template import EmailContent, staff_alert
from core.reservations import (
    advance_or_release,
    estimate_ready_at,
    promote_next_reservation,
    sweep_expired_reservations,
)
from core.settings import get_library_settings
from core.supabase import get_admin_client
from routers.books import _redact_for_patrons
from schemas.auth import UserProfile
from schemas.reservation import (
    CreateReservationRequest,
    Reservation,
    ReservationEstimate,
    UpdateReservationRequest,
)

router = APIRouter(prefix="/reservations", tags=["reservations"])

def _redact_embedded_books(rows: list[dict], user: UserProfile) -> list[dict]:
    # The books(*) embed carries the accession number and acquisition
    # record; a student's own reservation list must not, same rule as the
    # catalog (routers/books.py's _redact_for_patrons).
    _redact_for_patrons([r["books"] for r in rows if r.get("books")], user)
    return rows


NON_BORROWABLE_COLLECTION_TYPES = {"Reference", "Thesis", "Capstone", "MTR", "Archives"}


@router.get("", response_model=list[Reservation])
def list_reservations(
    user_id: str | None = None,
    user: UserProfile = Depends(get_current_user),
    db: Client = Depends(get_user_supabase),
):
    admin = get_admin_client()
    # Runs regardless of who's asking — the only way to catch another
    # student's expired reservation without a cron (none exists anywhere
    # in this repo; see the loan-overdue-status precedent in loans.py).
    sweep_expired_reservations(admin)

    # RLS scopes this automatically: students see only their own rows,
    # librarians see every reservation. No role branching needed here.
    # user_id narrows a librarian's already-full view to one patron (the
    # Patrons profile modal) — a student passing anyone else's id here
    # still only ever sees their own rows, since RLS scopes the query
    # itself, not just this filter.
    query = db.table("reservations").select("*, books(*), profiles(*)").order("requested_at", desc=True)
    if user_id:
        query = query.eq("user_id", user_id)
    res = query.execute()
    reservations = res.data

    # queue_position needs to count *other* students' pending reservations
    # too, which the caller's own RLS-scoped client can't see — the admin
    # client is required here, but only a computed integer ever leaves it.
    # The ready-date estimate is only for a student's own list — a
    # librarian's full list would pay for it on every pending row.
    cfg = get_library_settings(admin) if user.role != "librarian" else None
    for r in reservations:
        if r["status"] == "pending":
            ahead = (
                admin.table("reservations")
                .select("id", count="exact")
                .eq("book_id", r["book_id"])
                .eq("status", "pending")
                .lt("requested_at", r["requested_at"])
                .execute()
            )
            r["queue_position"] = (ahead.count or 0) + 1
            if cfg is not None:
                ready_at = estimate_ready_at(admin, r["book_id"], ahead.count or 0, cfg)
                r["estimated_ready_at"] = ready_at.isoformat() if ready_at else None

    return _redact_embedded_books(reservations, user)

def _reservation_problem(admin: Client, user_id: str, book_id: str, cfg: dict) -> str | None:
    """Why this student can't reserve this title right now, or None if they
    can. Shared by create_reservation (which rejects with it) and the
    estimate endpoint (which shows it in the confirmation popup before the
    student taps Confirm, rather than after). Raises 404 for an unknown book.

    Plan 5.2: "Same account checks as borrowing" — mirrors holds.py's
    claim_hold, duplicated rather than imported (matches this codebase's
    existing convention for small per-router constants)."""
    book_res = admin.table("books").select("collection_type").eq("id", book_id).execute()
    if not book_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Book not found")
    collection_type = book_res.data[0]["collection_type"]
    if collection_type in NON_BORROWABLE_COLLECTION_TYPES:
        return f"{collection_type} items are for library use only and can't be reserved"

    current_loans = (
        admin.table("loans")
        .select("id, due_date, book_copy_id")
        .eq("student_id", user_id)
        .in_("status", ["active", "overdue"])
        .execute()
    ).data
    now = datetime.now(timezone.utc)

    # Can't reserve a title you're currently the one holding — book_copy_id
    # is all a loan row has, so this is a copy -> book_id hop, same pattern
    # loans.py's own list_loans uses for the same reason (book_copies has no
    # RLS policy at all, so this second lookup needs the admin client too).
    copy_ids = [loan["book_copy_id"] for loan in current_loans]
    if copy_ids:
        borrowed_copies = admin.table("book_copies").select("id, book_id").in_("id", copy_ids).execute().data
        if any(c["book_id"] == book_id for c in borrowed_copies):
            return "You currently have this book borrowed — return it before reserving another copy"

    if any(datetime.fromisoformat(loan["due_date"]) < now for loan in current_loans):
        return "You have an overdue book — please return it before reserving another"
    if len(current_loans) >= cfg["max_books_per_borrower"]:
        return f"You've reached your borrowing limit of {cfg['max_books_per_borrower']} books"

    unsettled = (
        admin.table("loans")
        .select("id", count="exact")
        .eq("student_id", user_id)
        .eq("fine_status", "unsettled")
        .execute()
    )
    if (unsettled.count or 0) > 0:
        return "You have an unpaid fine — please settle it with the librarian"

    existing = (
        admin.table("reservations")
        .select("id")
        .eq("user_id", user_id)
        .eq("book_id", book_id)
        .in_("status", ["pending", "ready"])
        .execute()
    )
    if existing.data:
        return "You already have a reservation for this title"

    # Settings' "Maximum Active Reservations per User" — previously
    # persisted nowhere and enforced nowhere; a student could queue up an
    # unlimited number of titles at once.
    active_reservations = (
        admin.table("reservations")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .in_("status", ["pending", "ready"])
        .execute()
    )
    if (active_reservations.count or 0) >= cfg["max_active_reservations"]:
        return f"You've reached your limit of {cfg['max_active_reservations']} active reservations"

    # A reservation is for a title with no copy on the shelf. With one free
    # right now, reserving would put the student in a queue that walk-ins
    # can skip by just borrowing it — tell them to borrow instead. A copy
    # soft-held by someone mid-borrow doesn't count as free: if they back
    # out, release_hold hands it to the queue.
    available = (
        admin.table("book_copies").select("id").eq("book_id", book_id).eq("status", "available").execute()
    ).data
    if available:
        held_rows = (
            admin.table("soft_holds")
            .select("book_copy_id")
            .in_("book_copy_id", [c["id"] for c in available])
            .gt("expires_at", now.isoformat())
            .execute()
        ).data
        held = {h["book_copy_id"] for h in held_rows}
        if any(c["id"] not in held for c in available):
            return "A copy is available right now — borrow it instead of reserving"

    return None


@router.get("/estimate", response_model=ReservationEstimate)
def estimate_reservation(book_id: str, user: UserProfile = Depends(get_current_user)):
    """Where the caller would land in the queue for this title if they
    reserved it now, and roughly when a copy would be ready for them —
    shown before they confirm the reservation, along with anything that
    would stop the reservation going through."""
    admin = get_admin_client()
    cfg = get_library_settings(admin)
    problem = _reservation_problem(admin, user.id, book_id, cfg)
    ahead_count = (
        admin.table("reservations")
        .select("id", count="exact")
        .eq("book_id", book_id)
        .eq("status", "pending")
        .execute()
    ).count or 0
    ready_at = estimate_ready_at(admin, book_id, ahead_count, cfg)
    return {
        "queue_position": ahead_count + 1,
        "estimated_ready_at": ready_at.isoformat() if ready_at else None,
        "hold_period_days": cfg["reservation_hold_period_days"],
        "can_reserve": problem is None,
        "reason": problem,
    }

@router.post("", response_model=Reservation, status_code=status.HTTP_201_CREATED)
def create_reservation(
    body: CreateReservationRequest,
    user: UserProfile = Depends(get_current_user),
    db: Client = Depends(get_user_supabase),
):
    admin = get_admin_client()
    cfg = get_library_settings(admin)
    problem = _reservation_problem(admin, user.id, body.book_id, cfg)
    if problem:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, problem)

    # Counted before the insert below, so this is exactly how many pending
    # reservations are already ahead of the one about to be created —
    # i.e. this new reservation's own queue_position.
    ahead_count = (
        admin.table("reservations")
        .select("id", count="exact")
        .eq("book_id", body.book_id)
        .eq("status", "pending")
        .execute()
    ).count or 0

    res = db.table("reservations").insert({
        "user_id": user.id,
        "book_id": body.book_id,
        "status": "pending",
    }).execute()
    if not res.data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not create reservation")

    book_title_res = admin.table("books").select("title").eq("id", body.book_id).execute()
    book_title = book_title_res.data[0]["title"] if book_title_res.data else "A book"
    queue_position = ahead_count + 1
    notify_librarians(
        "Book reserved",
        f'{user.full_name or "A student"} reserved "{book_title}".',
        link="/librarian/reservations",
        email=staff_alert(
            subject=f"Book reserved: {book_title}",
            intro="A book has been reserved in Lasallia.",
            details=[
                ("Reserved by", user.full_name or user.email),
                ("Title", book_title),
                ("Queue position", f"#{queue_position}"),
            ],
            action="The next returned copy will be held for this reservation automatically.",
            link_label="View reservations",
            link="/librarian/reservations",
        ),
    )

    notify(
        user.id, "reservation_placed",
        "Reservation confirmed",
        (
            f'You\'re first in line for "{book_title}" — we\'ll notify you the moment a copy is ready.'
            if queue_position == 1
            else f'You\'re #{queue_position} in line for "{book_title}" — we\'ll notify you when it\'s your turn.'
        ),
        link="/user/reservations",
        email=EmailContent(
            subject=f"Reservation confirmed: {book_title}",
            intro="Your reservation has been placed.",
            details=[
                ("Title", book_title),
                ("Your place in line", "First" if queue_position == 1 else f"#{queue_position}"),
            ],
            paragraphs=[
                "We'll email you as soon as a copy is ready for pickup. You'll then have a few days to claim it "
                "at the LRC counter.",
            ],
            link_label="View your reservations",
            link="/user/reservations",
        ),
    )

    return res.data[0]

@router.patch("/{reservation_id}", response_model=Reservation)
def update_reservation(
    reservation_id: str,
    body: UpdateReservationRequest,
    user: UserProfile = Depends(get_current_user),
    db: Client = Depends(get_user_supabase),
):
    # Cancellation is the only manual action left — becoming 'ready' now
    # happens automatically (Phase 4's return handler, or the expiry sweep
    # above), never through this endpoint. RLS already restricts *whose*
    # row can be touched (own reservation, or any if librarian).
    current = db.table("reservations").select("id, user_id, book_id, book_copy_id, status").eq("id", reservation_id).execute()
    if not current.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reservation not found")
    row = current.data[0]
    if row["status"] not in ("pending", "ready"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This reservation can no longer be cancelled")

    now = datetime.now(timezone.utc)
    db.table("reservations").update({
        "status": "cancelled",
        "cancelled_at": now.isoformat(),
    }).eq("id", reservation_id).execute()

    # Cancelling a 'ready' reservation frees a specific copy — same
    # handoff as letting the pickup window expire.
    if row["status"] == "ready" and row["book_copy_id"]:
        advance_or_release(get_admin_client(), row)

    # A librarian cancelling on someone's behalf tells that student — they
    # lost their place in line and didn't do it themselves.
    if user.role == "librarian" and row["user_id"] != user.id:
        admin = get_admin_client()
        book_res = admin.table("books").select("title").eq("id", row["book_id"]).execute()
        book_title = book_res.data[0]["title"] if book_res.data else "A book"
        notify(
            row["user_id"], "reservation_cancelled",
            "Your reservation was cancelled",
            f'The LRC cancelled your reservation for "{book_title}".',
            link="/user/reservations",
            email=EmailContent(
                subject="Your reservation was cancelled",
                intro="The LRC has cancelled your reservation for the book below.",
                details=[
                    ("Title", book_title),
                ],
                paragraphs=[
                    "If you believe this was a mistake or still need the book, please ask at the LRC counter, "
                    "or reserve it again from the catalog.",
                ],
                link_label="View your reservations",
                link="/user/reservations",
            ),
        )

    # Only notify on the student's own cancellation — a librarian cancelling
    # a reservation on someone's behalf shouldn't notify librarians about
    # their own action.
    if user.role != "librarian":
        admin = get_admin_client()
        book_title_res = admin.table("books").select("title").eq("id", row["book_id"]).execute()
        book_title = book_title_res.data[0]["title"] if book_title_res.data else "A book"
        notify_librarians(
            "Reservation cancelled",
            f'{user.full_name or "A student"} cancelled their reservation for "{book_title}".',
            link="/librarian/reservations",
            email=staff_alert(
                subject=f"Reservation cancelled: {book_title}",
                intro="A reservation has been cancelled by the student.",
                details=[("Cancelled by", user.full_name or user.email), ("Title", book_title)],
                action=(
                    "If a copy was being held for this reservation, it has been passed to the next person in line "
                    "or released back to the shelf."
                ),
                link_label="View reservations",
                link="/librarian/reservations",
            ),
        )

    res = db.table("reservations").select("*, books(*), profiles(*)").eq("id", reservation_id).execute()
    return _redact_embedded_books(res.data, user)[0]

# Fulfillment no longer happens through this router at all — a 'ready'
# reservation is claimed and confirmed through the exact same flow as a
# walk-in borrow (holds.py's claim_hold routes a student with a ready
# reservation straight to their own held copy; loans.py's confirm_loan
# closes the reservation out once that loan is confirmed). There's
# deliberately only one borrowing path now, not a separate "pickup" one.
