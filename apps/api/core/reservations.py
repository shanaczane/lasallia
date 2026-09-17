from datetime import datetime, timedelta, timezone

from supabase import Client

from core.notify import notify
from core.settings import get_library_settings


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
            f'The reservation ahead of you for "{book_title}" was just fulfilled — you\'re up next.',
            link="/student/reservations",
        )

    return True
