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

# Plan 2.2/3.2/3.3's exact requirements, written into the prompt in strong
# terms rather than left implicit — Phase 8's adversarial testing is what
# actually verifies these hold, this is only the ask.
SYSTEM_PROMPT = """You are Lasallia, the library assistant for De La Salle Lipa's Learning Resource Center (LRC).

Rules — follow these exactly, they are not suggestions:
1. Only discuss books that appear in a tool call's results. Never mention a title, author, or detail about a book that was not returned by a tool call in this conversation — not from your own training knowledge, ever. If you recognize a title from your own knowledge but the tool didn't return it, treat it as not in the catalog.
2. If search_catalog returns nothing useful, say so plainly and suggest the student try different phrasing or ask a librarian. Never invent a plausible-sounding title to fill the gap.
3. Reply in the same language and style the student used, including mixed Taglish — if they write in Taglish, reply in Taglish.
4. Never mention, ask for, or make up an accession number. You will never be given one.
5. Keep prose short and additive. The book cards you return already show title, author, call number, shelf location, and availability — don't re-list those in text. A line like "I found 3 books on this — the first two are on the Mezzanine" is enough.
6. You cannot reserve, renew, or borrow books through this conversation. If asked, point to the Reserve/View buttons on the book cards, or the catalog page.
7. search_catalog results never include a book's description — that field only exists in get_book_details' result. If asked what a book is about, or for any detail beyond title/author/call number/availability, you MUST call get_book_details for that specific book_id before answering, even if you already have the book from a search_catalog result. Never conclude a description is missing or absent just because search_catalog didn't show you one — you have to actually call get_book_details and check its "description" field first.
8. Once you have get_book_details' result: if "description" is a non-empty string, you may summarize, rephrase, or shorten it, but you may NOT add any claim, fact, or opinion that isn't in it — no "this is considered a classic," no "commonly used in undergraduate courses," nothing, unless the description itself says so.
9. If get_book_details' "description" field is null or empty, you must NOT describe the book from your own knowledge, even if you recognize the exact title and know exactly what it's about — this is the single most important rule in this prompt. Instead say plainly that the catalog has no description for it, then mention what IS on record: its subject headings, call number, and collection type. If "nearby_by_call_number" is present, you may add that similar titles sit nearby on the shelf.
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


# get_book_details' result (core/tools/book_details.py's BookDetailsResult)
# needs its own trimming: the description itself, collection_type (which
# isn't on the frontend-facing Book type at all), and nearby_by_call_number
# only when there's no description to summarize instead — rule 8 above
# depends on that field's presence/absence to decide which branch to take.
def _book_details_for_model(result) -> dict:
    b = result.book
    data = {
        "id": b.id,
        "title": b.title,
        "author": b.author,
        "description": b.abstract,
        "subject": b.subject,
        "call_number": b.call_number,
        "collection_type": result.collection_type,
        "published_year": b.published_year,
        "publisher": b.publisher,
        "status": b.status,
        "available_copies": b.available_copies,
        "total_copies": b.total_copies,
        "shelf_location": b.shelf_location,
    }
    if result.nearby_by_call_number:
        data["nearby_by_call_number"] = result.nearby_by_call_number
    return data


# A single completion call only ever returns the tool calls the model
# wants *right now* — chaining search_catalog -> get_book_details (the
# model doesn't have a book_id to call the latter with until it's seen
# the former's results) needs the model to be asked again after seeing
# each round's results. Capped so a model that never stops requesting
# tools can't loop forever within one request.
MAX_TOOL_ROUNDS = 4


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
        books_out: list[dict] = []
        reply = ""

        for _ in range(MAX_TOOL_ROUNDS):
            response = client.chat.completions.create(model=CHAT_MODEL, messages=messages, tools=tools)
            choice = response.choices[0]

            if not choice.message.tool_calls:
                reply = choice.message.content or ""
                break

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
                    tool_content: Any = {"error": str(e)}
                else:
                    if call.function.name == "search_catalog":
                        new_books = [b.model_dump() for b in result]
                        books_out.extend(new_books)
                        tool_content = [_book_for_model(b) for b in new_books]
                    elif call.function.name == "get_book_details":
                        books_out.append(result.book.model_dump())
                        tool_content = _book_details_for_model(result)
                    else:
                        tool_content = result

                messages.append({
                    "role": "tool",
                    "tool_call_id": call.id,
                    "content": json.dumps(tool_content),
                })

            yield _sse("status", {"status": "writing"})
        else:
            # Exhausted MAX_TOOL_ROUNDS and the model still wants tools —
            # force a final answer with no tools offered, so it has to
            # respond in text with whatever it's already learned.
            final = client.chat.completions.create(model=CHAT_MODEL, messages=messages)
            reply = final.choices[0].message.content or ""

        yield _sse("done", {"reply": reply, "books": books_out, "session_id": session_id})

    return StreamingResponse(stream(), media_type="text/event-stream")
