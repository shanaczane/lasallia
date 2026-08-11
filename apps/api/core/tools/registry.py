"""Chatbot Phases 2-5 — builds the tool list available to a single chat
request based on the caller's auth state, and dispatches a model's tool
call to the right handler.

Structural home of two of the chatbot plan's non-negotiable rules:
- Account tools (core/tools/account.py, Phase 5) are only ever included
  in available_tools() when `user` is not None — an unauthenticated
  session's tool list never contains them. Not registered-and-refusing:
  not present.
- Any tool handler that needs the caller's identity receives it as
  `user`, injected here at dispatch time — never as a model-suppliable
  argument. See core/tools/account.py's own docstring for why.
"""

from dataclasses import dataclass
from typing import Any, Callable

from core.tools import catalog
from schemas.auth import UserProfile


@dataclass
class ToolSpec:
    """One tool's OpenAI-facing schema plus its Python handler.

    `schema` is the raw function-calling JSON schema (name, description,
    parameters) exactly as OpenAI expects it. It must never declare an
    identity parameter (student_id, user_id, etc.) — see
    core/tools/account.py.
    """

    schema: dict[str, Any]
    handler: Callable[..., Any]


class ToolRegistry:
    """Built once per chat request (routers/chat.py). `user` is None for
    guest/unauthenticated sessions."""

    def __init__(self, user: UserProfile | None):
        self.user = user

    def available_tools(self) -> list[ToolSpec]:
        """The tool specs this session may call, in OpenAI tool-calling
        format. Catalog/book-details/policy tools (Phases 2-4) are
        always included; account tools (Phase 5) are appended only when
        self.user is not None.

        Only Phase 2's search_catalog is wired up so far — book_details
        (Phase 3), policy (Phase 4), and account (Phase 5) tools stay out
        of this list until those phases are actually built, per the
        chatbot plan's "build one phase at a time."
        """
        return [ToolSpec(schema=catalog.TOOL_SCHEMA, handler=catalog.search_catalog)]

    def dispatch(self, name: str, arguments: dict[str, Any]) -> Any:
        """Executes the named tool call by looking it up in
        available_tools() for THIS session and invoking its handler.
        Must raise if `name` isn't in that list — a guest session must
        never be able to reach an account tool even via a crafted
        request, regardless of what the model itself would or wouldn't
        attempt."""
        for spec in self.available_tools():
            if spec.schema["function"]["name"] == name:
                return spec.handler(**arguments)
        raise ValueError(f"Unknown or unavailable tool for this session: {name}")
