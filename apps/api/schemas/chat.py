"""HTTP contract for routers/chat.py. Tool-calling JSON schemas live
beside their tool in core/tools/, not here — this is only the
student-facing request/response shape."""

from typing import Literal

from pydantic import BaseModel

from schemas.book import Book


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None  # None starts a new session (Phase 7)


class ChatResponse(BaseModel):
    reply: str
    books: list[Book] | None = None
    session_id: str
