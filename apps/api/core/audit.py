# The audit log: who did what under the shared librarian login. Call
# log_action right after the change is saved. A logging failure never blocks
# the action, since the librarian's work has already happened; it goes to the
# server log instead.
#
# Never put PINs, card ids or tokens in details.

import logging
from typing import Any

from schemas.auth import ActiveLibrarian

logger = logging.getLogger("lasallia.audit")

# What the Audit Log page and export call each action.
ACTIONS: dict[str, str] = {
    "loan.return": "Book returned",
    "loan.assisted_borrow": "Assisted borrow",
    "fine.payment": "Fine payment",
    "reservation.pickup": "Reservation pickup",
    "reservation.cancel": "Reservation cancelled",
    "in_house.checkout": "Guest checkout",
    "in_house.return": "Guest return",
    "book.create": "Book added",
    "book.update": "Book edited",
    "book.delete": "Book deleted",
    "book.cover": "Book cover changed",
    "book.archive": "Book archived",
    "book.restore": "Book restored",
    "book.dismiss": "Weeding candidate dismissed",
    "copy.add": "Copies added",
    "copy.register": "Existing copy registered",
    "copy.mark_found": "Copy marked found",
    "accession.correct": "Accession number corrected",
    "catalog.import": "Catalog imported",
    "catalog.export_new_copies": "New copies exported",
    "report.export": "Report exported",
    "settings.update": "Settings changed",
    "loan.send_reminder": "Overdue reminder sent",
    "book_request.review": "Book request review started",
    "book_request.approve": "Book request approved",
    "book_request.reject": "Book request rejected",
    "book_request.fulfill": "Book request fulfilled",
    "calendar.close_date": "Closed date added",
    "calendar.reopen_date": "Closed date removed",
    "user.update": "User account edited",
    "librarian_profile.create": "Librarian profile added",
    "librarian_profile.update": "Librarian profile edited",
    "librarian_profile.disable": "Librarian profile disabled",
    "librarian_profile.enable": "Librarian profile enabled",
    "librarian_profile.reset_pin": "Librarian PIN reset",
    "librarian_profile.link_card": "Staff ID linked",
    "librarian_profile.unlink_card": "Staff ID unlinked",
}


def log_action(
    admin,
    librarian: ActiveLibrarian,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    try:
        admin.table("audit_log").insert({
            "librarian_profile_id": librarian.librarian_profile_id,
            "librarian_name": librarian.librarian_name,
            "action": action,
            "entity_type": entity_type,
            "entity_id": str(entity_id) if entity_id is not None else None,
            "details": details or {},
        }).execute()
    except Exception:
        logger.exception(
            "Audit log write failed: %s on %s %s by profile %s",
            action, entity_type, entity_id, librarian.librarian_profile_id,
        )


def changed_fields(before: dict, after: dict) -> dict[str, dict[str, Any]]:
    """{field: {"from": old, "to": new}} for the fields in `after` that differ."""
    return {
        key: {"from": before.get(key), "to": value}
        for key, value in after.items()
        if before.get(key) != value
    }


def audit_query(
    admin,
    date_from: str | None = None,
    date_to: str | None = None,
    librarian_profile_id: str | None = None,
    action: str | None = None,
    count: str | None = None,
):
    """A fresh filtered select, newest first."""
    query = admin.table("audit_log").select("*", count=count) if count else admin.table("audit_log").select("*")
    if date_from:
        query = query.gte("created_at", date_from)
    if date_to:
        query = query.lte("created_at", date_to)
    if librarian_profile_id:
        query = query.eq("librarian_profile_id", librarian_profile_id)
    if action:
        query = query.eq("action", action)
    return query.order("created_at", desc=True)
