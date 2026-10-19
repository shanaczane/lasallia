"""Starting, storing and ending chatbot conversations.

Web chats are kept across visits. Kiosk chats are deleted when the kiosk
session ends; a kiosk chat's id is the same as its station session's id.
"""

from datetime import datetime, timezone

from supabase import Client

from schemas.chat import ChatMessage, ChatSource


def start_session(admin: Client, session_id: str, user_id: str | None, surface: str) -> None:
    """Creates the chat session if it doesn't exist yet. Safe to call on
    every message."""
    admin.table("chat_sessions").upsert({
        "id": session_id,
        "student_id": user_id,
        "surface": surface,
    }, on_conflict="id", ignore_duplicates=True).execute()


def append_message(
    admin: Client, session_id: str, role: str, content: str, sources: list[ChatSource] | None = None
) -> None:
    """Adds a message. `sources` (where the answer came from) is only set
    on assistant replies."""
    row = {"session_id": session_id, "role": role, "content": content}
    if sources:
        row["sources"] = [s.model_dump() for s in sources]
    admin.table("chat_messages").insert(row).execute()


def get_history(admin: Client, session_id: str) -> list[ChatMessage]:
    """All messages in a session, oldest first. A kiosk session never
    contains a previous student's messages, since each visit gets a new id."""
    rows = (
        admin.table("chat_messages")
        .select("role, content, sources")
        .eq("session_id", session_id)
        .order("created_at")
        .execute()
    ).data
    return [ChatMessage(role=r["role"], content=r["content"], sources=r.get("sources") or []) for r in rows]


def delete_session(admin: Client, session_id: str) -> None:
    """Deletes a chat and its messages (the "delete this chat" button)."""
    admin.table("chat_sessions").delete().eq("id", session_id).execute()


def end_session(admin: Client, session_id: str, surface: str) -> None:
    """Ends a session. Kiosk chats are deleted with their messages; web
    chats are kept and just get an ended_at time."""
    if surface == "kiosk":
        admin.table("chat_sessions").delete().eq("id", session_id).execute()
    else:
        admin.table("chat_sessions").update({
            "ended_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", session_id).execute()
