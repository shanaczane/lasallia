# The overdue list on Borrow & Return, and "Send reminder now". Librarians only.

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from core.audit import log_action
from core.calendar import overdue_status
from core.dates import manila_now, parse_timestamp
from core.deps import require_librarian, require_librarian_profile
from core.loan_reminders import LOAN_SELECT, deliver, manila_day_number, manual_reminder
from core.overdue_list import overdue_list
from core.settings import get_library_settings
from core.supabase import get_admin_client
from schemas.auth import UserProfile
from schemas.reports import OverdueListRow

router = APIRouter(prefix="/overdue", tags=["overdue"])


@router.get("", response_model=list[OverdueListRow])
def list_overdue(librarian: UserProfile = Depends(require_librarian)):
    return overdue_list(get_admin_client())


@router.post("/{loan_id}/remind", status_code=status.HTTP_201_CREATED)
def send_reminder_now(loan_id: UUID, librarian: UserProfile = Depends(require_librarian_profile)):
    admin = get_admin_client()
    rows = admin.table("loans").select(LOAN_SELECT).eq("id", str(loan_id)).execute().data
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Loan not found")
    loan = rows[0]
    if loan.get("returned_at") or loan["status"] == "returned":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This book has already been returned")
    if parse_timestamp(loan["due_date"]) > manila_now():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This book isn't overdue")

    book = (loan.get("book_copies") or {}).get("books") or {}
    state = overdue_status(admin, loan["due_date"], book.get("collection_type") or "General")
    reminder = manual_reminder(loan, state.school_days, state.library_hours, state.fine, get_library_settings(admin))

    if not deliver(admin, loan["student_id"], loan["id"], reminder):
        already = (
            admin.table("loan_reminder_log").select("id").eq("loan_id", loan["id"]).eq("kind", "manual")
            .eq("occurrence", manila_day_number(manila_now().date())).execute().data
        )
        if already:
            raise HTTPException(status.HTTP_409_CONFLICT, "A reminder already went out for this loan today")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not send the reminder. Please try again")

    log_action(admin, librarian, "loan.send_reminder", "loan", loan["id"], {"title": reminder.title})
    return {"sent": True}
