"""Chatbot Phase 7 — chat session lifecycle.

Kiosk sessions are ephemeral: history is cleared on idle timeout,
logout, or a different ID tapping in — the same session boundary
apps/api/routers/sessions.py's station_sessions already enforces for
borrowing, reused here rather than inventing a second notion of
"session ended." A kiosk chat session's id IS that station session's id
(no FK — see migrations/0016's own note on why), so ending one already
ends the other with a single added call, no separate wiring to keep in
sync. Web sessions persist across visits. One implementation of what a
session is, used by both surfaces, so the kiosk-vs-web difference is a
`surface` value here, not two parallel code paths.
"""

from datetime import datetime, timezone

from supabase import Client

from schemas.chat import ChatMessage


def start_session(admin: Client, session_id: str, user_id: str | None, surface: str) -> None:
    """Starts a chat session, or is a no-op if it already exists — the
    kiosk assistant page calls this with the station session's id on
    every message, not just the first, since it doesn't track locally
    whether this is the first message of the visit."""
    admin.table("chat_sessions").upsert({
        "id": session_id,
        "student_id": user_id,
        "surface": surface,
    }, on_conflict="id", ignore_duplicates=True).execute()


def append_message(admin: Client, session_id: str, role: str, content: str) -> None:
    """Appends one message to a session's history."""
    admin.table("chat_messages").insert({
        "session_id": session_id,
        "role": role,
        "content": content,
    }).execute()


def get_history(admin: Client, session_id: str) -> list[ChatMessage]:
    """Full message history for a session, oldest first. For a kiosk
    session this only ever contains what's happened since it was opened —
    never a previous student's messages — because the id itself changes
    every time a new station session opens; there is no way to address a
    prior visit's history from a new one."""
    rows = (
        admin.table("chat_messages")
        .select("role, content")
        .eq("session_id", session_id)
        .order("created_at")
        .execute()
    ).data
    return [ChatMessage(role=r["role"], content=r["content"]) for r in rows]


def end_session(admin: Client, session_id: str, surface: str) -> None:
    """Closes a session. For a kiosk surface, this is where history
    actually gets cleared from storage — deletes the chat_sessions row,
    cascading to its messages. For web, the session is left in place
    (its whole purpose is to persist) and just gets an ended_at
    timestamp for bookkeeping."""
    if surface == "kiosk":
        admin.table("chat_sessions").delete().eq("id", session_id).execute()
    else:
        admin.table("chat_sessions").update({
            "ended_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", session_id).execute()
