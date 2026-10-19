from pydantic import BaseModel

TicketCategory = str  # 'login' | 'technical' | 'account' | 'other'
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


# Ticket numbers are sequential and easy to guess, so the submitter's email
# is required too.
class TrackTicketRequest(BaseModel):
    ticket_number: str
    email: str


# What a public ticket lookup returns: no librarian id or contact details.
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
