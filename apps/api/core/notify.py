import resend

from core.config import RESEND_API_KEY
from core.email_template import EmailContent, render_html, render_text
from core.supabase import get_admin_client
# Import the type list instead of copying it: a type missing from
# schemas/notification.py breaks GET /notifications for that user.
from schemas.notification import NotificationType

# lasallia.com is verified on Resend.
FROM_ADDRESS = "Lasallia <notifications@lasallia.com>"


# Never raises: an email problem must not fail a borrow, return or
# reservation. Skips sending when RESEND_API_KEY isn't set.
def send_email(to_email: str, content: EmailContent, recipient_name: str | None = None) -> None:
    # .invalid addresses are test accounts, not real inboxes.
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


# Sends an in-app notification, plus an email when `email` is given.
# Never raises: it runs after the real action already succeeded, so a
# notification problem must not fail it. Due-date reminders are sent
# separately by supabase/functions/loan-reminders.
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

# Notifies every librarian (one notification row each).
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
