# apps/api/routers/support_tickets.py
# Login page's Contact Support form (submit + track — both public, no auth)
# and the librarian Support Tickets inbox (list + update — require_librarian).
# See migrations/0038_support_tickets.sql.

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status, Depends

from core.deps import require_librarian
from core.supabase import get_admin_client
from schemas.auth import UserProfile
from schemas.support_ticket import (
    CreateSupportTicketRequest,
    SupportTicket,
    TicketStatusView,
    TrackTicketRequest,
    UpdateSupportTicketRequest,
)

router = APIRouter(prefix="/support-tickets", tags=["support-tickets"])


@router.post("", response_model=SupportTicket, status_code=status.HTTP_201_CREATED)
def create_ticket(body: CreateSupportTicketRequest):
    name = body.name.strip()
    email = body.email.strip()
    message = body.message.strip()
    if not name or not email or not message:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Name, email, and message are required")

    admin = get_admin_client()
    res = admin.table("support_tickets").insert({
        "name": name,
        "email": email,
        "category": body.category,
        "message": message,
    }).execute()
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not submit this ticket")
    return res.data[0]


# Public — no auth. Requires the submitting email as well as the ticket
# number so the sequential LRC-000001-style number alone can't be guessed
# to read someone else's ticket (see TrackTicketRequest's docstring).
@router.post("/track", response_model=TicketStatusView)
def track_ticket(body: TrackTicketRequest):
    admin = get_admin_client()
    res = (
        admin.table("support_tickets")
        .select("*")
        .eq("ticket_number", body.ticket_number.strip())
        .ilike("email", body.email.strip())
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No ticket found with that number and email")
    return res.data[0]


@router.get("", response_model=list[SupportTicket])
def list_tickets(
    ticket_status: str | None = None,
    librarian: UserProfile = Depends(require_librarian),
):
    query = get_admin_client().table("support_tickets").select("*").order("created_at", desc=True)
    if ticket_status:
        query = query.eq("status", ticket_status)
    return query.execute().data


@router.patch("/{ticket_id}", response_model=SupportTicket)
def update_ticket(
    ticket_id: str,
    body: UpdateSupportTicketRequest,
    librarian: UserProfile = Depends(require_librarian),
):
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No changes given")

    changes["updated_at"] = datetime.now(timezone.utc).isoformat()
    changes["handled_by"] = librarian.id
    if changes.get("status") == "resolved":
        changes["resolved_at"] = datetime.now(timezone.utc).isoformat()

    admin = get_admin_client()
    res = admin.table("support_tickets").update(changes).eq("id", ticket_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    return res.data[0]
