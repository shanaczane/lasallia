# Loan reminders, run by pg_cron through /internal
# (supabase/cron/loan_reminders_api_schedule.sql).
#
# Daily, 8:00 AM Manila, for everything except the hourly collections:
#   due_tomorrow    the day before the due date
#   due_today       on the due date
#   overdue_first   1 school day after the due date, with the fine so far
#   overdue_repeat  every 3 school days after that, until the book is returned
#                   or the fine reaches the maximum
# plus the unpaid fine reminder, every 7 days until it's paid.
#
# Every 15 minutes, for the hourly collections:
#   reserve_due_soon  30 minutes before the due time
#   reserve_overdue   at the due time
#
# loan_reminder_log's unique key stops duplicates, so a job can run twice or
# overlap. A missed run catches up with one reminder, not one per missed day.

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from core.calendar import HOURLY_FINE_COLLECTION_TYPES, HOURLY_FINE_RATE, overdue_status
from core.dates import MANILA, date_text, manila_now, overdue_text, parse_timestamp, school_days_text, time_text
from core.email_template import EmailContent, peso
from core.notify import email_user, notify
from core.paging import fetch_all_rows
from core.settings import get_library_settings

REPEAT_EVERY_SCHOOL_DAYS = 3
FINE_REMINDER_COOLDOWN_DAYS = 7
RESERVE_NOTICE_MINUTES = 30

LOAN_LINK = "/user/library"
FINE_LINK = "/user/profile"
_CONFLICT = "loan_id,kind,occurrence,channel"
LOAN_SELECT = (
    "id, student_id, due_date, status, returned_at, book_copies(accession_number, books(title, collection_type))"
)


@dataclass
class Reminder:
    kind: str
    occurrence: int
    notification_type: str  # 'due_reminder' or 'overdue'
    title: str
    message: str
    email: EmailContent


def _claim(admin, loan_id: str, kind: str, occurrence: int, channel: str) -> bool:
    """Writes the log row. False means this reminder already went out."""
    res = admin.table("loan_reminder_log").upsert(
        {"loan_id": loan_id, "kind": kind, "occurrence": occurrence, "channel": channel},
        on_conflict=_CONFLICT, ignore_duplicates=True,
    ).execute()
    return bool(res.data)


def _release(admin, loan_id: str, kind: str, occurrence: int, channel: str) -> None:
    (
        admin.table("loan_reminder_log").delete()
        .eq("loan_id", loan_id).eq("kind", kind).eq("occurrence", occurrence).eq("channel", channel)
        .execute()
    )


def deliver(admin, student_id: str, loan_id: str, reminder: Reminder, link: str = LOAN_LINK) -> bool:
    """Sends in-app and email once each. A failed notification gives the
    claim back, so the next run retries it."""
    key = (loan_id, reminder.kind, reminder.occurrence)
    if not _claim(admin, *key, "in_app"):
        return False
    if not notify(student_id, reminder.notification_type, reminder.title, reminder.message, link=link):
        _release(admin, *key, "in_app")
        return False
    if _claim(admin, *key, "email"):
        email_user(student_id, reminder.email)
    return True


def _book(loan: dict) -> dict:
    return (loan.get("book_copies") or {}).get("books") or {}


def _title(loan: dict) -> str:
    return _book(loan).get("title") or "your book"


def _is_hourly(loan: dict) -> bool:
    return _book(loan).get("collection_type") in HOURLY_FINE_COLLECTION_TYPES


def _email(subject: str, intro: str, loan: dict, extra: list[tuple[str, str]], paragraph: str) -> EmailContent:
    return EmailContent(
        subject=subject,
        intro=intro,
        details=[("Title", _title(loan)), ("Due date", f"{date_text(loan['due_date'])}, {time_text(loan['due_date'])}"), *extra],
        paragraphs=[paragraph],
        link_label="View your loans",
        link=LOAN_LINK,
    )


def _fine_rule(cfg: dict) -> str:
    return f"{peso(cfg['fine_per_day'])} per school day, up to {peso(cfg['max_fine_per_book'])} per book"


def _hourly_rule(cfg: dict) -> str:
    return f"{peso(HOURLY_FINE_RATE)} per library hour, up to {peso(cfg['max_fine_per_book'])} per book"


def _due_soon(loan: dict, kind: str, title: str, when: str, cfg: dict) -> Reminder:
    return Reminder(
        kind=kind, occurrence=1, notification_type="due_reminder", title=title,
        message=f'"{_title(loan)}" is due {when}. Please return it to the LRC counter.',
        email=_email(
            f"{title}: {_title(loan)}",
            f"This is a reminder that your borrowed book is due {when}.",
            loan, [],
            f"Please return it to the LRC counter on or before the due date to avoid an overdue fine of {_fine_rule(cfg)}.",
        ),
    )


def _overdue(loan: dict, kind: str, occurrence: int, title: str, fine: float, rule: str) -> Reminder:
    return Reminder(
        kind=kind, occurrence=occurrence, notification_type="overdue", title=title,
        message=(
            f'"{_title(loan)}": {title.lower()}. Fine so far: {peso(fine)} ({rule}). '
            "Please return it to the LRC counter as soon as possible."
        ),
        email=_email(
            f"{title}: {_title(loan)}",
            f"Your borrowed book is {title.lower()}.",
            loan, [("Fine so far", peso(fine))],
            f"Please return it to the LRC counter as soon as possible. The fine is {rule}.",
        ),
    )


def manual_reminder(loan: dict, school_days: int, library_hours: float, fine: float, cfg: dict) -> Reminder:
    """A librarian's "Send reminder now". Once per loan per Manila day."""
    hourly = _is_hourly(loan)
    return _overdue(
        loan, "manual", manila_day_number(manila_now().date()),
        overdue_text(school_days, library_hours, hourly), fine,
        _hourly_rule(cfg) if hourly else _fine_rule(cfg),
    )


def general_reminder(loan: dict, today: date, now: datetime, days: int, fine: float, cfg: dict) -> Reminder | None:
    """The reminder this loan is due for today, if any. `days` is the school
    days overdue and `fine` the fine so far."""
    due = parse_timestamp(loan["due_date"])
    due_day = due.astimezone(MANILA).date()

    if due_day == today + timedelta(days=1):
        return _due_soon(loan, "due_tomorrow", "Due tomorrow", f"tomorrow, {date_text(due)}, {time_text(due)}", cfg)
    if due_day == today and now < due:
        return _due_soon(loan, "due_today", f"Due today, {time_text(due)}", f"today, {time_text(due)}", cfg)
    if days < 1:
        return None

    # School day 1 is the first notice; 4, 7, 10… are repeats 1, 2, 3…
    repeat = (days - 1) // REPEAT_EVERY_SCHOOL_DAYS
    if repeat == 0:
        return _overdue(loan, "overdue_first", 1, school_days_text(days), fine, _fine_rule(cfg))
    if fine >= cfg["max_fine_per_book"]:
        return None
    return _overdue(loan, "overdue_repeat", repeat, school_days_text(days), fine, _fine_rule(cfg))


def reserve_reminder(loan: dict, now: datetime, cfg: dict) -> Reminder | None:
    due = parse_timestamp(loan["due_date"])
    if now >= due:
        title = "Reserve material overdue"
        return Reminder(
            kind="reserve_overdue", occurrence=1, notification_type="overdue", title=title,
            message=(
                f'"{_title(loan)}" was due {date_text(due)}, {time_text(due)}. '
                f"The fine is {_hourly_rule(cfg)}, for the hours the library is open."
            ),
            email=_email(
                f"{title}: {_title(loan)}",
                "Your borrowed reserve material is now overdue.",
                loan, [],
                f"Please return it to the LRC counter as soon as possible. The fine is {_hourly_rule(cfg)}, "
                "for the hours the library is open.",
            ),
        )
    if due - now <= timedelta(minutes=RESERVE_NOTICE_MINUTES):
        title = f"Due today, {time_text(due)}"
        return Reminder(
            kind="reserve_due_soon", occurrence=1, notification_type="due_reminder", title=title,
            message=f'"{_title(loan)}" is due at {time_text(due)}. Please return it to the LRC counter.',
            email=_email(
                f"{title}: {_title(loan)}",
                f"This is a reminder that your borrowed reserve material is due at {time_text(due)}.",
                loan, [],
                f"Please return it to the LRC counter on time to avoid an overdue fine of {_hourly_rule(cfg)}.",
            ),
        )
    return None


def _open_loans(admin) -> list[dict]:
    return fetch_all_rows(lambda: (
        admin.table("loans").select(LOAN_SELECT)
        .is_("returned_at", "null").in_("status", ["active", "overdue"]).order("id")
    ))


def send_daily_reminders(admin) -> dict:
    """One failed loan doesn't stop the rest of the run."""
    cfg = get_library_settings(admin)
    now = datetime.now(timezone.utc)
    today = manila_now().date()
    sent = 0
    for loan in _open_loans(admin):
        if _is_hourly(loan):
            continue
        try:
            status = overdue_status(admin, loan["due_date"], _book(loan).get("collection_type") or "General")
            reminder = general_reminder(loan, today, now, status.school_days, status.fine, cfg)
            if reminder and deliver(admin, loan["student_id"], loan["id"], reminder):
                sent += 1
        except Exception as e:
            print(f"send_daily_reminders() failed (loan={loan.get('id')}): {e}")
    fines = _send_fine_reminders(admin, now)
    print(f"send_daily_reminders(): {sent} loan reminders, {fines} fine reminders")
    return {"loan_reminders": sent, "fine_reminders": fines}


def send_reserve_reminders(admin) -> dict:
    cfg = get_library_settings(admin)
    now = datetime.now(timezone.utc)
    sent = 0
    for loan in _open_loans(admin):
        if not _is_hourly(loan):
            continue
        try:
            reminder = reserve_reminder(loan, now, cfg)
            if reminder and deliver(admin, loan["student_id"], loan["id"], reminder):
                sent += 1
        except Exception as e:
            print(f"send_reserve_reminders() failed (loan={loan.get('id')}): {e}")
    return {"reserve_reminders": sent}


def manila_day_number(day: date) -> int:
    """2026-11-14 -> 20261114, the occurrence of a once-a-day reminder."""
    return day.year * 10000 + day.month * 100 + day.day


def _send_fine_reminders(admin, now: datetime) -> int:
    """Unpaid fines on returned books, every 7 days until they're paid."""
    cutoff = now - timedelta(days=FINE_REMINDER_COOLDOWN_DAYS)
    loans = fetch_all_rows(lambda: (
        admin.table("loans")
        .select("id, student_id, fine_amount, fine_reminder_last_sent_at, book_copies(books(title))")
        .eq("fine_status", "unsettled").gt("fine_amount", 0).order("id")
    ))
    occurrence = manila_day_number(manila_now().date())
    sent = 0
    for loan in loans:
        last = loan.get("fine_reminder_last_sent_at")
        if last and parse_timestamp(last) >= cutoff:
            continue
        title = _book(loan).get("title") or "a book"
        amount = peso(loan.get("fine_amount"))
        reminder = Reminder(
            kind="fine_reminder", occurrence=occurrence, notification_type="fine_reminder",
            title="Unpaid fine reminder",
            message=f'You still have an unpaid fine of {amount} for "{title}". Please settle it at the LRC circulation desk.',
            email=EmailContent(
                subject="Reminder: you have an unpaid fine",
                intro="This is a reminder that you have an unpaid fine at the LRC.",
                details=[("Title", title), ("Amount due", amount)],
                paragraphs=[
                    "Please settle it in person at the LRC counter. Unpaid fines may keep you from borrowing "
                    "or reserving books until they are paid.",
                ],
                link_label="View your fines",
                link=FINE_LINK,
            ),
        )
        try:
            if deliver(admin, loan["student_id"], loan["id"], reminder, link=FINE_LINK):
                admin.table("loans").update({"fine_reminder_last_sent_at": now.isoformat()}).eq("id", loan["id"]).execute()
                sent += 1
        except Exception as e:
            print(f"_send_fine_reminders() failed (loan={loan.get('id')}): {e}")
    return sent
