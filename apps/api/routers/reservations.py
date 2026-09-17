from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from core.deps import get_current_user, get_user_supabase
from core.notify import notify, notify_librarians
from core.reservations import promote_next_reservation
from core.settings import get_library_settings
from core.supabase import get_admin_client
from schemas.auth import UserProfile
from schemas.reservation import (
    CreateReservationRequest,
    Reservation,
    UpdateReservationRequest,
)

router = APIRouter(prefix="/reservations", tags=["reservations"])

NON_BORROWABLE_COLLECTION_TYPES = {"Reference", "Thesis", "Capstone", "MTR", "Archives"}


def _advance_or_release(admin: Client, expired: dict) -> None:
    """A 'ready' reservation whose copy is no longer going to be picked up
    by that student — either its pickup_by passed, or they cancelled.
    Hands the copy to the next pending reservation on the same title (and
    notifies whoever that leaves at the new front of the queue), or
    releases it back toward general circulation if nobody's waiting."""
    promoted = promote_next_reservation(admin, expired["book_id"], expired["book_copy_id"])
    if not promoted and expired.get("book_copy_id"):
        # available -> for_reshelving isn't legal, but reserved -> for_reshelving
        # is — same "never straight to available" rule Phase 4 already follows.
        admin.table("book_copies").update({"status": "for_reshelving"}).eq("id", expired["book_copy_id"]).execute()


def _sweep_expired_reservations(admin: Client) -> None:
    now = datetime.now(timezone.utc)
    expired = (
        admin.table("reservations")
        .select("id, user_id, book_id, book_copy_id")
        .eq("status", "ready")
        .lt("pickup_by", now.isoformat())
        .execute()
    ).data
    for row in expired:
        _advance_or_release(admin, row)
        admin.table("reservations").update({"status": "expired"}).eq("id", row["id"]).execute()
        book_res = admin.table("books").select("title").eq("id", row["book_id"]).execute()
        book_title = book_res.data[0]["title"] if book_res.data else "Your reservation"
        notify(
            row["user_id"], "reservation_cancelled",
            "Pickup window expired",
            f'"{book_title}" was not picked up in time and the hold has been released.',
            link="/student/reservations",
        )


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
    _sweep_expired_reservations(admin)

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

    return reservations

@router.post("", response_model=Reservation, status_code=status.HTTP_201_CREATED)
def create_reservation(
    body: CreateReservationRequest,
    user: UserProfile = Depends(get_current_user),
    db: Client = Depends(get_user_supabase),
):
    # Plan 5.2: "Same account checks as borrowing" — mirrors holds.py's
    # claim_hold, duplicated rather than imported (matches this codebase's
    # existing convention for small per-router constants).
    admin = get_admin_client()
    cfg = get_library_settings(admin)

    book_res = admin.table("books").select("collection_type").eq("id", body.book_id).execute()
    if not book_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Book not found")
    collection_type = book_res.data[0]["collection_type"]
    if collection_type in NON_BORROWABLE_COLLECTION_TYPES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"{collection_type} items are for library use only and can't be reserved",
        )

    current_loans = (
        admin.table("loans")
        .select("id, due_date, book_copy_id")
        .eq("student_id", user.id)
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
        if any(c["book_id"] == body.book_id for c in borrowed_copies):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "You currently have this book borrowed — return it before reserving another copy")

    if any(datetime.fromisoformat(loan["due_date"]) < now for loan in current_loans):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You have an overdue book — please return it before reserving another")
    if len(current_loans) >= cfg["max_books_per_borrower"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"You've reached your borrowing limit of {cfg['max_books_per_borrower']} books")

    unsettled = (
        admin.table("loans")
        .select("id", count="exact")
        .eq("student_id", user.id)
        .eq("fine_status", "unsettled")
        .execute()
    )
    if (unsettled.count or 0) > 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You have an unpaid fine — please settle it with the librarian")

    existing = (
        admin.table("reservations")
        .select("id")
        .eq("user_id", user.id)
        .eq("book_id", body.book_id)
        .in_("status", ["pending", "ready"])
        .execute()
    )
    if existing.data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You already have a reservation for this title")

    # Settings' "Maximum Active Reservations per User" — previously
    # persisted nowhere and enforced nowhere; a student could queue up an
    # unlimited number of titles at once.
    active_reservations = (
        admin.table("reservations")
        .select("id", count="exact")
        .eq("user_id", user.id)
        .in_("status", ["pending", "ready"])
        .execute()
    )
    if (active_reservations.count or 0) >= cfg["max_active_reservations"]:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"You've reached your limit of {cfg['max_active_reservations']} active reservations",
        )

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
    notify_librarians(
        "Book reserved",
        f'{user.full_name or "A student"} reserved "{book_title}".',
        link="/librarian/reservations",
    )

    queue_position = ahead_count + 1
    notify(
        user.id, "reservation_placed",
        "Reservation confirmed",
        (
            f'You\'re first in line for "{book_title}" — we\'ll notify you the moment a copy is ready.'
            if queue_position == 1
            else f'You\'re #{queue_position} in line for "{book_title}" — we\'ll notify you when it\'s your turn.'
        ),
        link="/student/reservations",
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
    current = db.table("reservations").select("id, book_id, book_copy_id, status").eq("id", reservation_id).execute()
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
        _advance_or_release(get_admin_client(), row)

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
        )

    res = db.table("reservations").select("*, books(*), profiles(*)").eq("id", reservation_id).execute()
    return res.data[0]

# Fulfillment no longer happens through this router at all — a 'ready'
# reservation is claimed and confirmed through the exact same flow as a
# walk-in borrow (holds.py's claim_hold routes a student with a ready
# reservation straight to their own held copy; loans.py's confirm_loan
# closes the reservation out once that loan is confirmed). There's
# deliberately only one borrowing path now, not a separate "pickup" one.
