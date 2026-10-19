import heapq
import logging
import time
from datetime import datetime, timedelta, timezone

from supabase import Client

from core.notify import notify
from core.email_template import EmailContent, long_date_time
from core.settings import get_library_settings

logger = logging.getLogger(__name__)

# Philippine time has no DST, so a fixed offset works (and avoids needing
# tzdata on Windows).
MANILA = timezone(timedelta(hours=8))


def promote_next_reservation(admin: Client, book_id: str, copy_id: str) -> bool:
    """Gives a freed copy to the first student in the reservation queue,
    sets their reservation to 'ready' and notifies them. The next student
    in line is told they're now first.

    Call this anywhere a copy is freed, so it goes to the queue before
    anyone else. Returns True if a reservation got the copy; the caller
    then sets the copy's status."""
    # Already held for someone: stop, so a repeated request can't give the
    # same copy to two students.
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

    book_res = admin.table("books").select("title").eq("id", book_id).execute()
    book_title = book_res.data[0]["title"] if book_res.data else "A book"
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
            # Neutral wording: the person ahead may have picked up, cancelled or expired.
            f'You\'re now first in line for "{book_title}" — we\'ll notify you when it\'s ready for pickup.',
            link="/user/reservations",
            email=EmailContent(
                subject=f"You're now first in line: {book_title}",
                intro="Good news! You've moved to the front of the reservation queue.",
                details=[
                    ("Title", book_title),
                    ("Your place in line", "First"),
                ],
                paragraphs=["We'll email you again as soon as a copy is ready for pickup at the LRC."],
                link_label="View your reservations",
                link="/user/reservations",
            ),
        )

    return True


def advance_or_release(admin: Client, reservation: dict) -> None:
    """For a ready reservation that won't be picked up (expired or
    cancelled): gives the copy to the next in line, or sends it to
    reshelving if nobody is waiting.

    Mark the reservation expired/cancelled first, or the copy looks
    "already held" and gets stuck as 'reserved'."""
    promoted = promote_next_reservation(admin, reservation["book_id"], reservation["book_copy_id"])
    if not promoted and reservation.get("book_copy_id"):
        # Back via reshelving, never straight to available.
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
        # Only update rows still 'ready', so two requests at once can't
        # expire the same reservation twice.
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

        # Notify before handing the copy on, so a handoff error can't skip
        # the notice (a later sweep won't retry this row).
        book_res = admin.table("books").select("title").eq("id", row["book_id"]).execute()
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
    """Rough date a copy will be ready for someone with `ahead` people in
    front of them. Assumes everyone returns on time and keeps the book for
    a full loan period. None if no copy is expected back (all lost/missing)."""
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


# Expired pickups are handled every minute by run_expiry_loop (started in
# main.py). Busy endpoints also trigger it as a backup, at most once a minute.
SWEEP_MIN_INTERVAL_SECONDS = 60
_last_sweep_at: float | None = None


async def run_expiry_loop() -> None:
    """Runs the expiry sweep every minute, in a thread so it doesn't block
    the server."""
    import asyncio

    from core.supabase import get_admin_client

    while True:
        await asyncio.to_thread(maybe_sweep_expired_reservations, get_admin_client())
        await asyncio.sleep(SWEEP_MIN_INTERVAL_SECONDS)


def maybe_sweep_expired_reservations(admin: Client) -> None:
    """Runs the sweep at most once a minute and never raises, so it can't
    break the endpoint calling it."""
    global _last_sweep_at
    now = time.monotonic()
    if _last_sweep_at is not None and now - _last_sweep_at < SWEEP_MIN_INTERVAL_SECONDS:
        return
    _last_sweep_at = now
    try:
        sweep_expired_reservations(admin)
    except Exception:
        logger.exception("Expired-reservation sweep failed")
