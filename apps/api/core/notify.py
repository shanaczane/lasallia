from typing import Literal

from core.supabase import get_admin_client

NotificationType = Literal[
    "due_reminder", "overdue", "reservation_confirmed",
    "reservation_cancelled", "return_confirmed",
]

# Fire-and-forget insert used by write endpoints across loans.py/reservations.py
# at the moment something actually happens to a user's loan or reservation —
# not a queue, not retried, matching this codebase's existing "no background
# job infra" reality. Due-date reminders (due_reminder/overdue) need a real
# scheduler (cron/Edge Function) and aren't wired up by anything yet.
def notify(user_id: str, type: NotificationType, title: str, message: str, link: str | None = None) -> None:
    get_admin_client().table("notifications").insert({
        "user_id": user_id,
        "type": type,
        "title": title,
        "message": message,
        "link": link,
    }).execute()
