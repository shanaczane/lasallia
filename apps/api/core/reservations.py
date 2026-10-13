import logging
import time
from datetime import datetime, timedelta, timezone

from supabase import Client

from core.notify import notify
from core.settings import get_library_settings

logger = logging.getLogger(__name__)


def promote_next_reservation(admin: Client, book_id: str, copy_id: str) -> bool:
    """Hands a freshly-freed copy to the oldest pending reservation on this
    title, if any, promoting it straight to 'ready' (Phase 5: automatic, no
    librarian pre-approval) and notifying that student. If that leaves a
    new reservation at the front of the queue, that student is notified
    too — they aren't getting the book yet, but "you're next" is worth
    knowing on its own rather than only surfacing on their next visit to
    the book page.

    Shared by every place a copy would otherwise go back into open
    circulation (loans.py's return_loan and reshelve_copy, reservations.py's
    expiry sweep and ready-reservation cancellation) — without one shared
    check, any of those paths could hand the copy to a walk-in instead of
    the person who's been waiting.

    Returns whether a reservation was promoted. Callers still decide the
    copy's own resulting status from that — a promoted copy is always
    'reserved', but what happens when nothing was promoted differs by
    caller (back to for_reshelving on a return, straight to available on
    the reshelving scan)."""
    # Idempotency guard: a copy is only ever held for one reservation at a
    # time. Without this, two near-simultaneous calls for the same copy_id
    # (a double-submitted return/reshelve request, a retried request, two
    # tabs open on the same action) would each independently query "the
    # oldest still-pending reservation" — the first call promotes student
    # A and flips them out of 'pending', so the second call's query no
    # longer sees A and promotes student B on top of the exact same
    # physical copy, leaving two reservations both 'ready' for one book.
    already_held = (
        admin.table("reservations")
        .select("id")
        .eq("book_copy_id", copy_id)
        .eq("status", "ready")
        .execute()
    ).data
    if already_held:
        return True

    pending = (
        admin.table("reservations")
        .select("id, user_id")
        .eq("book_id", book_id)
        .eq("status", "pending")
        .order("requested_at")
        .limit(2)
        .execute()
    ).data
    if not pending:
        return False

    hold_days = get_library_settings(admin)["reservation_hold_period_days"]
    now = datetime.now(timezone.utc)
    admin.table("reservations").update({
        "book_copy_id": copy_id,
        "status": "ready",
        "confirmed_at": now.isoformat(),
        "pickup_by": (now + timedelta(days=hold_days)).isoformat(),
    }).eq("id", pending[0]["id"]).execute()

    book_res = admin.table("books").select("title").eq("id", book_id).execute()
    book_title = book_res.data[0]["title"] if book_res.data else "A book"
    notify(
        pending[0]["user_id"], "reservation_confirmed",
        "Your reserved book is ready for pickup",
        f'"{book_title}" is waiting for you at the LRC counter.',
        link="/student/reservations",
    )

    if len(pending) > 1:
        notify(
            pending[1]["user_id"], "reservation_queue_advanced",
            "You're now first in line",
            # Neutral on purpose: this runs after a pickup, a cancellation or
            # an expired pickup window alike, so "fulfilled" was often wrong.
            f'You\'re now first in line for "{book_title}" — we\'ll notify you when it\'s ready for pickup.',
            link="/student/reservations",
        )

    return True


def advance_or_release(admin: Client, reservation: dict) -> None:
    """A 'ready' reservation whose copy is no longer going to be picked up
    by that student — either its pickup_by passed, or they cancelled.
    Hands the copy to the next pending reservation on the same title (and
    notifies whoever that leaves at the new front of the queue), or
    releases it back toward general circulation if nobody's waiting.

    The reservation must already be marked expired/cancelled before this
    runs: promote_next_reservation treats any 'ready' row on the copy as
    "already held" and would otherwise skip the queue, leaving the copy
    stuck as 'reserved'."""
    promoted = promote_next_reservation(admin, reservation["book_id"], reservation["book_copy_id"])
    if not promoted and reservation.get("book_copy_id"):
        # available -> for_reshelving isn't legal, but reserved -> for_reshelving
        # is — same "never straight to available" rule Phase 4 already follows.
        admin.table("book_copies").update({"status": "for_reshelving"}).eq("id", reservation["book_copy_id"]).execute()


def sweep_expired_reservations(admin: Client) -> int:
    """Expires every 'ready' reservation whose pickup_by has passed and
    hands its copy on. Returns how many were expired."""
    now = datetime.now(timezone.utc)
    overdue = (
        admin.table("reservations")
        .select("id, user_id, book_id, book_copy_id")
        .eq("status", "ready")
        .lt("pickup_by", now.isoformat())
        .execute()
    ).data

    expired_count = 0
    for row in overdue:
        # Conditional on still being 'ready', so two sweeps racing on the
        # same row (two requests landing at once) only expire, notify and
        # hand the copy on once — the loser's update matches nothing.
        claimed = (
            admin.table("reservations")
            .update({"status": "expired"})
            .eq("id", row["id"])
            .eq("status", "ready")
            .execute()
        ).data
        if not claimed:
            continue
        expired_count += 1

        advance_or_release(admin, row)
        book_res = admin.table("books").select("title").eq("id", row["book_id"]).execute()
        book_title = book_res.data[0]["title"] if book_res.data else "Your reservation"
        notify(
            row["user_id"], "reservation_cancelled",
            "Pickup window expired",
            f'"{book_title}" was not picked up in time and the hold has been released.',
            link="/student/reservations",
        )
    return expired_count


# No scheduler exists in this repo, so the sweep piggybacks on ordinary
# traffic (catalog, book page, kiosk borrow, loans list). Throttled per
# process so those hot paths pay for the query at most once a minute.
SWEEP_MIN_INTERVAL_SECONDS = 60
_last_sweep_at: float | None = None


def maybe_sweep_expired_reservations(admin: Client) -> None:
    """Throttled, never-raising sweep for endpoints whose real job is
    something else — an expiry hiccup must not break the catalog."""
    global _last_sweep_at
    now = time.monotonic()
    if _last_sweep_at is not None and now - _last_sweep_at < SWEEP_MIN_INTERVAL_SECONDS:
        return
    _last_sweep_at = now
    try:
        sweep_expired_reservations(admin)
    except Exception:
        logger.exception("Expired-reservation sweep failed")
