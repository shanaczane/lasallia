# apps/api/routers/chat.py
# Chatbot Phase 2 — the orchestration endpoint. Resolves the caller's
# ToolRegistry, runs the tool-calling loop against the model, and
# returns a structured response the frontend renders as book cards /
# policy citations / plain text.
#
# Retrieval stays reachable without this file — see routers/search.py,
# which core/tools/catalog.py wraps rather than this router reimplementing.

from fastapi import APIRouter, Depends

from core.deps import get_optional_user
from schemas.auth import UserProfile
from schemas.chat import ChatRequest, ChatResponse

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/message", response_model=ChatResponse)
def send_message(
    body: ChatRequest,
    user: UserProfile | None = Depends(get_optional_user),
):
    """Not implemented yet (Phase 2). Will build a
    core.tools.registry.ToolRegistry(user), run the tool-calling loop
    against the model, append to the chat session via
    core.chat_sessions (Phase 7), and return a ChatResponse."""
    raise NotImplementedError
