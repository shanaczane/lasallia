from pydantic import BaseModel

TicketCategory = str  # 'login' | 'technical' | 'account' | 'other' — see migrations/0038
TicketStatus = str    # 'open' | 'in_progress' | 'resolved'


class SupportTicket(BaseModel):
    id: str
    ticket_number: str
    name: str
    email: str
    category: TicketCategory
    message: str
    status: TicketStatus
    resolution_note: str | None = None
    handled_by: str | None = None
    created_at: str
    updated_at: str
    resolved_at: str | None = None


class CreateSupportTicketRequest(BaseModel):
    name: str
    email: str
    category: TicketCategory = "other"
    message: str


# Looking a ticket up by number alone would let anyone enumerate the
# sequential LRC-000001, LRC-000002... range and read strangers' messages —
# requiring the email that submitted it as a second factor is the cheapest
# fix that doesn't need a separate secret/token system.
class TrackTicketRequest(BaseModel):
    ticket_number: str
    email: str


# Deliberately excludes handled_by (a librarian's user id) and the
# submitter's own name/email, which the tracker already knows — this is
# what an anonymous tracking lookup gets back, not the librarian's full view.
class TicketStatusView(BaseModel):
    ticket_number: str
    category: TicketCategory
    status: TicketStatus
    resolution_note: str | None = None
    created_at: str
    resolved_at: str | None = None


class UpdateSupportTicketRequest(BaseModel):
    status: TicketStatus | None = None
    resolution_note: str | None = None
