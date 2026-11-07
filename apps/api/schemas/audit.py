# The Audit Log page.

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AuditLogEntry(BaseModel):
    id: str
    librarian_profile_id: str
    librarian_name: str
    action: str
    action_label: str
    entity_type: str
    entity_id: str | None = None
    details: dict[str, Any]
    created_at: datetime


class AuditLogPage(BaseModel):
    items: list[AuditLogEntry]
    total: int
    page: int
    page_size: int


class AuditLibrarianOption(BaseModel):
    id: str
    full_name: str


class AuditActionOption(BaseModel):
    value: str
    label: str


class AuditLogOptions(BaseModel):
    librarians: list[AuditLibrarianOption]
    actions: list[AuditActionOption]
