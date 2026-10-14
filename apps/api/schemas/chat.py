"""HTTP contract for routers/chat.py. Tool-calling JSON schemas live
beside their tool in core/tools/, not here — this is only the
student-facing request/response shape."""

from typing import Literal

from pydantic import BaseModel

from schemas.book import Book


class ChatSource(BaseModel):
    """One place an assistant answer came from — see core/chat_sources.py."""
    kind: Literal["handbook", "book", "catalog", "hours", "account"]
    label: str
    detail: str | None = None
    book_id: str | None = None  # kind == "book" only, so the frontend can link to its page


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    sources: list[ChatSource] = []


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None  # None starts a new session (web only — kiosk always sends one, its station session's id)
    surface: Literal["kiosk", "web"] = "web"


class ChatResponse(BaseModel):
    reply: str
    books: list[Book] | None = None
    sources: list[ChatSource] = []
    session_id: str


class ChatSessionSummary(BaseModel):
    """One row in the web 'Recent Chats' list — enough to label it and
    jump back in, not the full transcript (see GET /chat/sessions/{id}
    for that)."""
    id: str
    started_at: str
    last_message_preview: str | None = None


class ChatHistoryResponse(BaseModel):
    session_id: str
    messages: list[ChatMessage]
