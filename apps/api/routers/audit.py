# The Audit Log page. Read-only, for librarians; rows are written by
# core/audit.py. Exports go through /reports/export.

from fastapi import APIRouter, Depends, HTTPException, Query, status

from core.audit import ACTIONS, audit_query
from core.dates import report_bound
from core.deps import require_librarian
from core.supabase import get_admin_client
from schemas.audit import AuditLogOptions, AuditLogPage
from schemas.auth import UserProfile

router = APIRouter(prefix="/audit-log", tags=["audit-log"])


@router.get("", response_model=AuditLogPage)
def list_audit_log(
    date_from: str | None = None,
    date_to: str | None = None,
    librarian_profile_id: str | None = None,
    action: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    librarian: UserProfile = Depends(require_librarian),
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The start date is after the end date.")
    start = (page - 1) * page_size
    res = audit_query(
        get_admin_client(),
        # Whole Manila days, like the reports.
        date_from=report_bound(date_from, end=False),
        date_to=report_bound(date_to, end=True),
        librarian_profile_id=librarian_profile_id,
        action=action,
        count="exact",
    ).range(start, start + page_size - 1).execute()
    return AuditLogPage(
        items=[{**row, "action_label": ACTIONS.get(row["action"], row["action"])} for row in res.data],
        total=res.count or 0,
        page=page,
        page_size=page_size,
    )


@router.get("/options", response_model=AuditLogOptions)
def audit_log_options(librarian: UserProfile = Depends(require_librarian)):
    """What the filters offer. Disabled librarians stay, for their history."""
    profiles = get_admin_client().table("librarian_profiles").select("id, full_name").order("full_name").execute().data
    return AuditLogOptions(
        librarians=profiles,
        actions=[{"value": value, "label": label} for value, label in sorted(ACTIONS.items(), key=lambda kv: kv[1])],
    )
