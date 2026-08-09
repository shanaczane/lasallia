"""Chatbot Phase 7 — chat session lifecycle.

Kiosk sessions are ephemeral: history is cleared on idle timeout,
logout, or a different ID tapping in — the same session boundary
apps/api/routers/sessions.py's station_sessions already enforces for
borrowing, reused here rather than inventing a second notion of
"session ended." Web sessions persist across visits. One implementation
of what a session is, used by both surfaces, so the kiosk-vs-web
difference is a `surface` value here, not two parallel code paths.
"""

from schemas.chat import ChatMessage


def start_session(user_id: str | None, surface: str) -> str:
    """Starts a new chat session and returns its id. `surface` is
    'kiosk' or 'web' — governs whether history outlives this visit."""
    raise NotImplementedError


def append_message(session_id: str, message: ChatMessage) -> None:
    """Appends one message to a session's history."""
    raise NotImplementedError


def get_history(session_id: str) -> list[ChatMessage]:
    """Full message history for a session. For a kiosk session this must
    only ever contain what's happened since it was opened — never a
    previous student's messages."""
    raise NotImplementedError


def end_session(session_id: str) -> None:
    """Closes a session. For a kiosk surface, this is where history
    actually gets cleared from storage — mirrors station_sessions
    setting ended_at."""
    raise NotImplementedError
