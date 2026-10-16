import heapq
import logging
import time
from datetime import datetime, timedelta, timezone

from supabase import Client

from core.notify import notify
from core.email_template import EmailContent, long_date_time
from core.settings import get_library_settings

logger = logging.getLogger(__name__)

# Philippine time has no DST, so a fixed offset is exact — and avoids
# zoneinfo, which needs the tzdata package on Windows.
MANILA = timezone(timedelta(hours=8))


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
    pickup_by = now + timedelta(days=hold_days)
    admin.table("reservations").update({
        "book_copy_id": copy_id,
        "status": "ready",
        "confirmed_at": now.isoformat(),
        "pickup_by": pickup_by.isoformat(),
    }).eq("id", pending[0]["id"]).execute()

    book_res = admin.table("books").select("title, call_number").eq("id", book_id).execute()
    book_title = book_res.data[0]["title"] if book_res.data else "A book"
    call_number = book_res.data[0].get("call_number") if book_res.data else None
    pickup_label = pickup_by.astimezone(MANILA).strftime("%B %d, %Y at %I:%M %p").replace(" 0", " ")
    notify(
        pending[0]["user_id"], "reservation_confirmed",
        "Your reserved book is ready for pickup",
        f'"{book_title}" is waiting for you at the LRC counter. Pick it up by {pickup_label} '
        "— after that the reservation expires and the copy goes to the next student in line.",
        link="/user/reservations",
        email=EmailContent(
            subject="Your reserved book is ready for pickup",
            intro="Good news! The book you reserved is now ready for pickup at the LRC.",
            details=[
                ("Title", book_title),
                ("Call No.", call_number),
                ("Pick up by", long_date_time(pickup_by)),
            ],
            paragraphs=[
                "Please claim it at the LRC counter before the deadline. If it is not picked up by then, "
                "the reservation will expire and the book will go to the next person in line.",
            ],
            link_label="View your reservation",
            link="/user/reservations",
        ),
    )

    if len(pending) > 1:
        notify(
            pending[1]["user_id"], "reservation_queue_advanced",
            "You're now first in line",
            # Neutral on purpose: this runs after a pickup, a cancellation or
            # an expired pickup window alike, so "fulfilled" was often wrong.
            f'You\'re now first in line for "{book_title}" — we\'ll notify you when it\'s ready for pickup.',
            link="/user/reservations",
            email=EmailContent(
                subject=f"You're now first in line: {book_title}",
                intro="Good news! You've moved to the front of the reservation queue.",
                details=[
                    ("Title", book_title),
                    ("Call No.", call_number),
                    ("Your place in line", "First"),
                ],
                paragraphs=["We'll email you again as soon as a copy is ready for pickup at the LRC."],
                link_label="View your reservations",
                link="/user/reservations",
            ),
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

        # The expired student is notified before the copy is handed on, so
        # a failure in the handoff can't swallow their notice — the row is
        # already 'expired' and won't be picked up by a later sweep.
        book_res = admin.table("books").select("title, call_number").eq("id", row["book_id"]).execute()
        book_title = book_res.data[0]["title"] if book_res.data else "your reserved book"
        notify(
            row["user_id"], "reservation_cancelled",
            "Your reservation has expired",
            f'You didn\'t pick up "{book_title}" before the pickup deadline, so your reservation has expired '
            "and the copy has been released. If you still want it, reserve it again "
            "— you'll join the end of the queue.",
            link=f"/user/catalog/{row['book_id']}?from=reservations",
            email=EmailContent(
                subject="Your reservation has expired",
                intro="Your reserved book was not picked up before the deadline, so the reservation has expired.",
                details=[
                    ("Title", book_title),
                    ("Call No.", book_res.data[0].get("call_number") if book_res.data else None),
                ],
                paragraphs=[
                    "The book has been released to the next person in line. If you still need it, "
                    "you can reserve it again. You will be added to the end of the queue.",
                ],
                link_label="Reserve it again",
                link=f"/user/catalog/{row['book_id']}",
            ),
        )
        try:
            advance_or_release(admin, row)
        except Exception:
            logger.exception("Could not hand on the copy of expired reservation %s", row["id"])
    return expired_count


def estimate_ready_at(admin: Client, book_id: str, ahead: int, cfg: dict | None = None) -> datetime | None:
    """Rough date a copy of this title should be ready for whoever has
    `ahead` pending reservations in front of them. Only an estimate: it
    assumes every borrower returns on their due date and everyone ahead
    picks up right away and keeps the book for a full loan period.

    Each usable copy gets a "free at" time — its loan's due date, now for
    a copy waiting to be reshelved, or one loan period from now for a copy
    already held for someone. The queue is then played forward: each person
    ahead takes the earliest-free copy and returns it a loan period later.
    Returns None when no copy is expected back at all (all lost/missing)."""
    cfg = cfg or get_library_settings(admin)
    loan_period = timedelta(days=cfg["standard_loan_period_days"])
    now = datetime.now(timezone.utc)

    copies = (
        admin.table("book_copies").select("id, status").eq("book_id", book_id).execute()
    ).data
    copies = [c for c in copies if c["status"] not in ("lost", "damaged", "missing")]
    if not copies:
        return None

    copy_ids = [c["id"] for c in copies]
    due_by_copy = {
        loan["book_copy_id"]: datetime.fromisoformat(loan["due_date"])
        for loan in (
            admin.table("loans")
            .select("book_copy_id, due_date")
            .in_("book_copy_id", copy_ids)
            .in_("status", ["active", "overdue"])
            .execute()
        ).data
    }

    free_at: list[datetime] = []
    for c in copies:
        due = due_by_copy.get(c["id"])
        if due is not None:
            # An overdue copy could come back any time — treat it as due now.
            free_at.append(max(due, now))
        elif c["status"] in ("available", "for_reshelving"):
            free_at.append(now)
        else:
            # Held for a ready reservation (or out with no loan record):
            # assume that student borrows it for a full loan period.
            free_at.append(now + loan_period)

    heapq.heapify(free_at)
    for _ in range(ahead):
        heapq.heappush(free_at, heapq.heappop(free_at) + loan_period)
    return free_at[0]


# The sweep runs on a timer (run_expiry_loop, started from main.py) so a
# lapsed pickup is expired, emailed and handed on within about a minute
# even when nobody is using the app. It also still piggybacks on ordinary
# traffic (catalog, book page, kiosk borrow, loans list, notifications) as
# a backstop, throttled per process so those hot paths pay for the query
# at most once a minute.
SWEEP_MIN_INTERVAL_SECONDS = 60
_last_sweep_at: float | None = None


async def run_expiry_loop() -> None:
    """Runs the expiry sweep every SWEEP_MIN_INTERVAL_SECONDS for the life
    of the API process. The sweep itself is blocking (supabase-py is sync),
    so it runs in a worker thread to keep the event loop free."""
    import asyncio

    from core.supabase import get_admin_client

    while True:
        await asyncio.to_thread(maybe_sweep_expired_reservations, get_admin_client())
        await asyncio.sleep(SWEEP_MIN_INTERVAL_SECONDS)


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
