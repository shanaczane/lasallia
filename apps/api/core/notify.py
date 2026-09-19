import resend

from core.config import FRONTEND_URL, RESEND_API_KEY
from core.supabase import get_admin_client
# schemas/notification.py is the single source of truth for this — it's also
# GET /notifications' response_model, so a type notify() can insert but that
# Pydantic model doesn't know about would fail response validation for the
# *entire* list (one bad row 500s the whole endpoint). Importing it here
# instead of re-declaring the Literal is what keeps the two from drifting —
# they already did once (this file had loan_confirmed/student_activity
# before schemas/notification.py did, and every GET /notifications call
# silently 500'd for any user with one of those rows until it was fixed).
from schemas.notification import NotificationType

# lasallia.com verified on Resend (DKIM/SPF/DMARC all confirmed) — real
# recipients (e.g. @dlsl.edu.ph) now receive mail, not just the sandbox
# testing address this used to point at.
FROM_ADDRESS = "Lasallia <notifications@lasallia.com>"


# Same fire-and-forget rule as notify() below: an email problem must
# never be the reason a real action (borrow, return, reservation) fails,
# so every failure here is logged and swallowed, never raised. Also
# no-ops quietly when RESEND_API_KEY isn't set — same lazy-key pattern
# as core/embeddings.py's OPENAI_API_KEY check — so the app keeps
# working with in-app-only notifications until a real key is added.
def _send_email(to_email: str, subject: str, body_text: str, link: str | None = None) -> None:
    if not RESEND_API_KEY:
        print(f"_send_email() skipped (no RESEND_API_KEY set) — would have emailed {to_email!r}: {subject!r}")
        return

    text = body_text
    if link:
        text += f"\n\nView details: {FRONTEND_URL}{link}"

    try:
        resend.api_key = RESEND_API_KEY
        resend.Emails.send({
            "from": FROM_ADDRESS,
            "to": [to_email],
            "subject": subject,
            "text": text,
        })
    except Exception as e:
        print(f"_send_email() failed (to={to_email}): {e}")


# Fire-and-forget insert used by write endpoints across loans.py/reservations.py
# at the moment something actually happens to a user's loan or reservation —
# not a queue, not retried, matching this codebase's existing "no background
# job infra" reality. Due-date reminders (due_reminder/overdue) need a real
# scheduler (cron/Edge Function) and aren't wired up by anything yet.
#
# "Fire-and-forget" has to mean the caller is never affected by this failing
# — every call site here runs inline, after the actual loan/reservation
# write already succeeded, so a notification problem (a type the DB's check
# constraint doesn't know about yet, a dropped connection, whatever) must
# never bubble up and fail the borrow/return/reservation itself. Swallowed
# and logged, not raised. The email send (see _send_email above) inherits
# the exact same rule — a flaky email provider must never be why a real
# checkout/return/reservation fails.
def notify(user_id: str, type: NotificationType, title: str, message: str, link: str | None = None) -> None:
    admin = get_admin_client()
    try:
        admin.table("notifications").insert({
            "user_id": user_id,
            "type": type,
            "title": title,
            "message": message,
            "link": link,
        }).execute()
    except Exception as e:
        print(f"notify() failed (user_id={user_id}, type={type}): {e}")
        return

    try:
        profile_res = admin.table("profiles").select("email").eq("id", user_id).execute()
        if profile_res.data and profile_res.data[0].get("email"):
            _send_email(profile_res.data[0]["email"], title, message, link)
    except Exception as e:
        print(f"notify() email lookup failed (user_id={user_id}, type={type}): {e}")

# notifications is a per-user_id row table (RLS scopes each caller to their
# own rows, librarian included — see routers/notifications.py) — there's no
# "broadcast to a role" concept, so notifying every librarian means one row
# per librarian. Used for "every student transaction" (checkout, return,
# reservation placed/cancelled) via the "student_activity" type.
def notify_librarians(title: str, message: str, link: str | None = None) -> None:
    try:
        admin = get_admin_client()
        librarians = admin.table("profiles").select("id").eq("role", "librarian").execute().data
    except Exception as e:
        print(f"notify_librarians() failed to look up librarians: {e}")
        return
    for librarian in librarians:
        notify(librarian["id"], "student_activity", title, message, link=link)
