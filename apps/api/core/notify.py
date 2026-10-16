import resend

from core.config import RESEND_API_KEY
from core.email_template import EmailContent, render_html, render_text
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
def send_email(to_email: str, content: EmailContent, recipient_name: str | None = None) -> None:
    # .invalid is a reserved TLD (RFC 2606) — only ever used by audit/UI-test
    # accounts (zz-audit-*, zz-ui-*), never a real inbox. Sending to them just
    # produces "Delivery Delayed" noise in Resend and hurts sender reputation.
    if to_email.lower().endswith(".invalid"):
        return

    if not RESEND_API_KEY:
        print(f"send_email() skipped (no RESEND_API_KEY set) — would have emailed {to_email!r}: {content.subject!r}")
        return

    try:
        resend.api_key = RESEND_API_KEY
        resend.Emails.send({
            "from": FROM_ADDRESS,
            "to": [to_email],
            "subject": content.subject,
            "html": render_html(content, recipient_name),
            "text": render_text(content, recipient_name),
        })
    except Exception as e:
        print(f"send_email() failed (to={to_email}): {e}")


def email_user(user_id: str, content: EmailContent) -> None:
    """Emails one account by id, greeting them by first name. Never raises."""
    try:
        res = get_admin_client().table("profiles").select("email, full_name").eq("id", user_id).execute()
        if res.data and res.data[0].get("email"):
            send_email(res.data[0]["email"], content, res.data[0].get("full_name"))
    except Exception as e:
        print(f"email_user() failed (user_id={user_id}): {e}")


# Fire-and-forget insert used by write endpoints across loans.py/reservations.py
# at the moment something actually happens to a user's loan or reservation —
# not a queue, not retried, matching this codebase's existing "no background
# job infra" reality. Due-date reminders (due_reminder/overdue) are the one
# exception: they're written by the daily Edge Function in
# supabase/functions/loan-reminders, which inserts into notifications (and
# emails) itself since it can't call this Python code.
#
# "Fire-and-forget" has to mean the caller is never affected by this failing
# — every call site here runs inline, after the actual loan/reservation
# write already succeeded, so a notification problem (a type the DB's check
# constraint doesn't know about yet, a dropped connection, whatever) must
# never bubble up and fail the borrow/return/reservation itself. Swallowed
# and logged, not raised. The email send (see send_email above) inherits
# the exact same rule — a flaky email provider must never be why a real
# checkout/return/reservation fails.
#
# The in-app notification always goes out; an email only when the caller
# passes `email` — the events worth an inbox message (due reminders, a
# ready reservation, a fine, a request decision…), written in the shared
# layout from core/email_template.py rather than reusing the one-line
# in-app message. Everything else (each checkout/return a librarian sees
# in their feed, a reservation being placed) stays in-app only.
def notify(
    user_id: str,
    type: NotificationType,
    title: str,
    message: str,
    link: str | None = None,
    email: EmailContent | None = None,
) -> None:
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

    if email is not None:
        email_user(user_id, email)

# notifications is a per-user_id row table (RLS scopes each caller to their
# own rows, librarian included — see routers/notifications.py) — there's no
# "broadcast to a role" concept, so notifying every librarian means one row
# per librarian. Used for "every student transaction" (checkout, return,
# reservation placed/cancelled) via the "student_activity" type.
def notify_librarians(
    title: str,
    message: str,
    link: str | None = None,
    type: NotificationType = "student_activity",
    email: EmailContent | None = None,
) -> None:
    try:
        admin = get_admin_client()
        librarians = admin.table("profiles").select("id").eq("role", "librarian").execute().data
    except Exception as e:
        print(f"notify_librarians() failed to look up librarians: {e}")
        return
    for librarian in librarians:
        notify(librarian["id"], type, title, message, link=link, email=email)
