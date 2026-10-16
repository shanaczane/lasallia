"""The one layout every Lasallia email uses, so they all read the same:

    Hi Maria,

    Good news! The book you reserved is now ready for pickup at the LRC.

    Title: Essentials of Supply Chain Management (5th ed.)
    Call No.: 658.7 H896e 2024
    Pick up by: Monday, October 20, 2026, 6:00 PM

    Please claim it at the LRC counter before the deadline. ...

    View your reservation: https://lasallia.com/user/reservations

    — Lasallia, De La Salle Lipa Learning Resource Center
    This is an automated message. Please do not reply to this email.

Callers describe *what* to say (an EmailContent); render_text() owns the
layout. supabase/functions/loan-reminders/index.ts renders the same layout
for the daily reminders, since that Deno job can't import this file.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from core.config import FRONTEND_URL

SIGNATURE = "— Lasallia, De La Salle Lipa Learning Resource Center"
AUTOMATED_NOTE = "This is an automated message. Please do not reply to this email."

# Philippine time has no DST, so a fixed offset is exact.
MANILA = timezone(timedelta(hours=8))


@dataclass
class EmailContent:
    subject: str
    intro: str
    # Label/value lines, e.g. ("Title", "…"). Empty values are skipped.
    details: list[tuple[str, str | None]] = field(default_factory=list)
    # Paragraphs after the details.
    paragraphs: list[str] = field(default_factory=list)
    # "View your loans" + "/user/library" -> "View your loans: https://…/user/library"
    link_label: str | None = None
    link: str | None = None
    # Patron emails carry the "automated message" line; staff alerts don't.
    automated: bool = True


def staff_alert(
    subject: str,
    intro: str,
    details: list[tuple[str, str | None]],
    action: str,
    link_label: str,
    link: str,
) -> EmailContent:
    """A librarian-facing alert: "Hello,", the details, what to do next, a
    link into the librarian dashboard, and no "automated message" line."""
    return EmailContent(
        subject=subject, intro=intro, details=details, paragraphs=[action],
        link_label=link_label, link=link, automated=False,
    )


def first_name(full_name: str | None) -> str | None:
    """First word of a profile name, in normal case — names are often
    stored in capitals ("MARIA SANTOS" -> "Maria")."""
    if not full_name or not full_name.strip():
        return None
    word = full_name.strip().split()[0]
    return word.capitalize() if word.isupper() else word


def render_text(content: EmailContent, recipient_name: str | None = None) -> str:
    """Plain-text body. recipient_name=None greets with "Hello," (used for
    staff alerts and anyone without a name on file)."""
    name = first_name(recipient_name)
    blocks = [f"Hi {name}," if name else "Hello,", content.intro]

    detail_lines = [f"{label}: {value}" for label, value in content.details if value]
    if detail_lines:
        blocks.append("\n".join(detail_lines))

    blocks.extend(p for p in content.paragraphs if p)

    if content.link:
        url = f"{FRONTEND_URL}{content.link}"
        blocks.append(f"{content.link_label}: {url}" if content.link_label else url)

    footer = [SIGNATURE] + ([AUTOMATED_NOTE] if content.automated else [])
    blocks.append("\n".join(footer))
    return "\n\n".join(blocks)


# ─── Shared formatting ─────────────────────────────────────────────────────

def _as_manila(value: str | datetime) -> datetime:
    dt = datetime.fromisoformat(value) if isinstance(value, str) else value
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(MANILA)


def long_date(value: str | datetime) -> str:
    """"Friday, October 17, 2026" in Philippine time."""
    d = _as_manila(value)
    return f"{d:%A}, {d:%B} {d.day}, {d.year}"


def long_date_time(value: str | datetime) -> str:
    """"Monday, October 20, 2026, 6:00 PM" in Philippine time."""
    d = _as_manila(value)
    hour = d.hour % 12 or 12
    return f"{long_date(d)}, {hour}:{d:%M} {'AM' if d.hour < 12 else 'PM'}"


def peso(amount: float | int | None) -> str:
    return f"₱{(amount or 0):,.2f}"
