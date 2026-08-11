# apps/api/routers/chat.py
# Chatbot Phase 2 — the orchestration endpoint. Resolves the caller's
# ToolRegistry, runs the tool-calling loop against the model, and
# returns a structured response the frontend renders as book cards /
# policy citations / plain text.
#
# Retrieval stays reachable without this file — see routers/search.py,
# which core/tools/catalog.py wraps rather than this router reimplementing.
#
# Streams status events over SSE (plan 2.4) so the frontend's
# TypingIndicator can show "searching the catalog" vs "writing a reply"
# instead of a generic dot animation — a tool call adds real latency a
# student could otherwise read as a freeze. Session history (Phase 7)
# isn't built yet, so session_id here is just an opaque id the frontend
# echoes back; nothing is persisted server-side against it yet.

import json
import secrets
from typing import Any, Iterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from openai import OpenAI

from core.config import OPENAI_API_KEY
from core.deps import get_optional_user
from core.tools.registry import ToolRegistry
from schemas.auth import UserProfile
from schemas.chat import ChatRequest

router = APIRouter(prefix="/chat", tags=["chat"])

CHAT_MODEL = "gpt-4o-mini"

# Plan 2.2's exact requirements, written into the prompt in strong terms
# rather than left implicit — Phase 8's adversarial testing is what
# actually verifies these hold, this is only the ask.
SYSTEM_PROMPT = """You are Lasallia, the library assistant for De La Salle Lipa's Learning Resource Center (LRC).

Rules — follow these exactly, they are not suggestions:
1. Only discuss books that appear in a tool call's results. Never mention a title, author, or detail about a book that was not returned by a tool call in this conversation — not from your own training knowledge, ever. If you recognize a title from your own knowledge but the tool didn't return it, treat it as not in the catalog.
2. If search_catalog returns nothing useful, say so plainly and suggest the student try different phrasing or ask a librarian. Never invent a plausible-sounding title to fill the gap.
3. Reply in the same language and style the student used, including mixed Taglish — if they write in Taglish, reply in Taglish.
4. Never mention, ask for, or make up an accession number. You will never be given one.
5. Keep prose short and additive. The book cards you return already show title, author, call number, shelf location, and availability — don't re-list those in text. A line like "I found 3 books on this — the first two are on the Mezzanine" is enough.
6. You cannot reserve, renew, or borrow books through this conversation. If asked, point to the Reserve/View buttons on the book cards, or the catalog page.
"""


def _get_client() -> OpenAI:
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not set — add a real key to .env before using chat")
    return OpenAI(api_key=OPENAI_API_KEY)


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


# What the model sees in the tool result — trimmed, not the full Book
# record the frontend gets back (no cover_url/cover_color noise in the
# model's context, and accession_no is already None from the tool itself).
def _book_for_model(book: dict) -> dict:
    return {
        "id": book.get("id"),
        "title": book.get("title"),
        "author": book.get("author"),
        "subject": book.get("subject"),
        "call_number": book.get("call_number"),
        "shelf_location": book.get("shelf_location"),
        "status": book.get("status"),
        "available_copies": book.get("available_copies"),
        "total_copies": book.get("total_copies"),
    }


@router.post("/message")
def send_message(
    body: ChatRequest,
    user: UserProfile | None = Depends(get_optional_user),
):
    registry = ToolRegistry(user)
    session_id = body.session_id or secrets.token_urlsafe(16)

    def stream() -> Iterator[str]:
        try:
            client = _get_client()
        except RuntimeError as e:
            yield _sse("error", {"detail": str(e)})
            return

        messages: list[dict[str, Any]] = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": body.message},
        ]
        tools = [spec.schema for spec in registry.available_tools()]

        first = client.chat.completions.create(model=CHAT_MODEL, messages=messages, tools=tools)
        choice = first.choices[0]
        books_out: list[dict] = []

        if choice.message.tool_calls:
            yield _sse("status", {"status": "searching"})

            messages.append({
                "role": "assistant",
                "content": choice.message.content,
                "tool_calls": [tc.model_dump() for tc in choice.message.tool_calls],
            })

            for call in choice.message.tool_calls:
                args = json.loads(call.function.arguments or "{}")
                try:
                    result = registry.dispatch(call.function.name, args)
                except Exception as e:
                    result = []
                    tool_content: Any = {"error": str(e)}
                else:
                    if call.function.name == "search_catalog":
                        books_out = [b.model_dump() for b in result]
                        tool_content = [_book_for_model(b) for b in books_out]
                    else:
                        tool_content = result

                messages.append({
                    "role": "tool",
                    "tool_call_id": call.id,
                    "content": json.dumps(tool_content),
                })

            yield _sse("status", {"status": "writing"})
            second = client.chat.completions.create(model=CHAT_MODEL, messages=messages)
            reply = second.choices[0].message.content or ""
        else:
            reply = choice.message.content or ""

        yield _sse("done", {"reply": reply, "books": books_out, "session_id": session_id})

    return StreamingResponse(stream(), media_type="text/event-stream")
