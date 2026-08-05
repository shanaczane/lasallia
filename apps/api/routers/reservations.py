from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from core.deps import get_current_user, get_user_supabase
from core.notify import notify
from core.supabase import get_admin_client
from schemas.auth import UserProfile
from schemas.loan import Loan
from schemas.reservation import (
    CreateReservationRequest,
    PickupReservationRequest,
    Reservation,
    UpdateReservationRequest,
)

router = APIRouter(prefix="/reservations", tags=["reservations"])

PICKUP_WINDOW_DAYS = 3
BORROW_LIMIT = 3
BORROW_PERIOD_DAYS = 14
NON_BORROWABLE_COLLECTION_TYPES = {"Reference", "Thesis", "Capstone", "MTR", "Archives"}


def _advance_or_release(admin: Client, expired: dict, now: datetime) -> None:
    """A 'ready' reservation whose copy is no longer going to be picked up
    by that student — either its pickup_by passed, or they cancelled.
    Hands the copy to the next pending reservation on the same title, or
    releases it back toward general circulation if nobody's waiting."""
    next_res = (
        admin.table("reservations")
        .select("id, user_id")
        .eq("book_id", expired["book_id"])
        .eq("status", "pending")
        .order("requested_at")
        .limit(1)
        .execute()
    ).data
    if next_res:
        admin.table("reservations").update({
            "book_copy_id": expired["book_copy_id"],
            "status": "ready",
            "confirmed_at": now.isoformat(),
            "pickup_by": (now + timedelta(days=PICKUP_WINDOW_DAYS)).isoformat(),
        }).eq("id", next_res[0]["id"]).execute()
        book_res = admin.table("books").select("title").eq("id", expired["book_id"]).execute()
        book_title = book_res.data[0]["title"] if book_res.data else "A book"
        notify(
            next_res[0]["user_id"], "reservation_confirmed",
            "Your reserved book is ready for pickup",
            f'"{book_title}" is waiting for you at the LRC counter.',
            link="/student/reservations",
        )
    elif expired.get("book_copy_id"):
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
        _advance_or_release(admin, row, now)
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
    res = db.table("reservations").select("*, books(*), profiles(*)").order("requested_at", desc=True).execute()
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
        .select("id, due_date")
        .eq("student_id", user.id)
        .in_("status", ["active", "overdue"])
        .execute()
    ).data
    now = datetime.now(timezone.utc)
    if any(datetime.fromisoformat(loan["due_date"]) < now for loan in current_loans):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You have an overdue book — please return it before reserving another")
    if len(current_loans) >= BORROW_LIMIT:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"You've reached your borrowing limit of {BORROW_LIMIT} books")

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

    res = db.table("reservations").insert({
        "user_id": user.id,
        "book_id": body.book_id,
        "status": "pending",
    }).execute()
    if not res.data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not create reservation")
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
        _advance_or_release(get_admin_client(), row, now)

    res = db.table("reservations").select("*, books(*), profiles(*)").eq("id", reservation_id).execute()
    return res.data[0]

# Fulfillment (plan 5.3): type the accession number, confirm — the same
# possession check as a normal borrow, just sourced from a reservation's
# assigned copy instead of a soft_hold.
@router.post("/{reservation_id}/pickup", response_model=Loan, status_code=status.HTTP_201_CREATED)
def pickup_reservation(
    reservation_id: str,
    body: PickupReservationRequest,
    user: UserProfile = Depends(get_current_user),
):
    admin = get_admin_client()

    res_row = admin.table("reservations").select("*").eq("id", reservation_id).execute()
    if not res_row.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reservation not found")
    reservation = res_row.data[0]

    if reservation["user_id"] != user.id and user.role != "librarian":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This isn't your reservation")
    if reservation["status"] != "ready":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This reservation isn't ready for pickup")

    now = datetime.now(timezone.utc)
    if reservation["pickup_by"] and datetime.fromisoformat(reservation["pickup_by"]) < now:
        # Stale page load — run the same one-row sweep rather than just
        # erroring, so the student isn't dead-ended on a page they already had open.
        _advance_or_release(admin, reservation, now)
        admin.table("reservations").update({"status": "expired"}).eq("id", reservation["id"]).execute()
        raise HTTPException(status.HTTP_410_GONE, "This reservation's pickup window has passed")

    # Same account checks as borrowing (Phase 3), re-verified here since
    # time has passed since the student joined the queue.
    current_loans = (
        admin.table("loans")
        .select("id, due_date")
        .eq("student_id", reservation["user_id"])
        .in_("status", ["active", "overdue"])
        .execute()
    ).data
    if any(datetime.fromisoformat(loan["due_date"]) < now for loan in current_loans):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You have an overdue book — please return it before borrowing another")
    if len(current_loans) >= BORROW_LIMIT:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"You've reached your borrowing limit of {BORROW_LIMIT} books")
    unsettled = (
        admin.table("loans")
        .select("id", count="exact")
        .eq("student_id", reservation["user_id"])
        .eq("fine_status", "unsettled")
        .execute()
    )
    if (unsettled.count or 0) > 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You have an unpaid fine — please settle it with the librarian")

    copy_res = admin.table("book_copies").select("*").eq("id", reservation["book_copy_id"]).execute()
    if not copy_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Copy not found")
    copy = copy_res.data[0]

    # Forgiving match (trim + case-insensitive), same as confirm_loan — but
    # no 3-strikes lockout here, this flow has no attempt_count column
    # (intentional scope trim, see the Phase 5 plan).
    submitted = body.accession_number.strip().lower()
    actual = (copy["accession_number"] or "").strip().lower()
    if submitted != actual:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That number belongs to a different book. Please check the label.")

    due_date = (now + timedelta(days=BORROW_PERIOD_DAYS)).isoformat()
    loan_res = admin.table("loans").insert({
        "book_copy_id": copy["id"],
        "student_id": reservation["user_id"],
        "station_session_id": None,
        "due_date": due_date,
        "condition_at_borrow": body.condition,
        "purpose": body.purpose,
        "notes": body.notes,
    }).execute()
    if not loan_res.data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not create the loan")

    # reserved -> on_loan: legal per Phase 1's status-machine trigger.
    admin.table("book_copies").update({"status": "on_loan"}).eq("id", copy["id"]).execute()
    admin.table("reservations").update({
        "status": "fulfilled",
        "fulfilled_at": now.isoformat(),
    }).eq("id", reservation["id"]).execute()

    loan = loan_res.data[0]
    book_res = admin.table("books").select("*").eq("id", copy["book_id"]).execute()
    loan["books"] = book_res.data[0] if book_res.data else None

    return loan
