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

from core.tools import account, book_details, catalog, policy
from schemas.auth import UserProfile


@dataclass
class ToolSpec:
    """One tool's OpenAI-facing schema plus its Python handler.

    `schema` is the raw function-calling JSON schema (name, description,
    parameters) exactly as OpenAI expects it. It must never declare an
    identity parameter (student_id, user_id, etc.) — see
    core/tools/account.py.

    `needs_user` marks handlers that require the caller's identity
    (core/tools/account.py's three). dispatch() injects it as a `user`
    kwarg when true — the model never supplies it, since these schemas
    declare no such parameter for it to fill.
    """

    schema: dict[str, Any]
    handler: Callable[..., Any]
    needs_user: bool = False


class ToolRegistry:
    """Built once per chat request (routers/chat.py). `user` is None for
    guest/unauthenticated sessions."""

    def __init__(self, user: UserProfile | None):
        self.user = user

    def available_tools(self) -> list[ToolSpec]:
        """The tool specs this session may call, in OpenAI tool-calling
        format. Catalog/book-details/policy tools (Phases 2-4) are
        always included; account tools (Phase 5) are appended only when
        self.user is not None — a guest's tool list never contains them
        at all, not registered-and-refusing.
        """
        tools = [
            ToolSpec(schema=catalog.TOOL_SCHEMA, handler=catalog.search_catalog),
            ToolSpec(schema=book_details.TOOL_SCHEMA, handler=book_details.get_book_details),
            ToolSpec(schema=policy.TOOL_SCHEMA, handler=policy.search_policy),
        ]
        if self.user is not None:
            tools += [
                ToolSpec(schema=account.GET_MY_LOANS_SCHEMA, handler=account.get_my_loans, needs_user=True),
                ToolSpec(schema=account.GET_MY_FINES_SCHEMA, handler=account.get_my_fines, needs_user=True),
                ToolSpec(schema=account.GET_MY_HISTORY_SCHEMA, handler=account.get_my_history, needs_user=True),
            ]
        return tools

    def dispatch(self, name: str, arguments: dict[str, Any]) -> Any:
        """Executes the named tool call by looking it up in
        available_tools() for THIS session and invoking its handler.
        Must raise if `name` isn't in that list — a guest session must
        never be able to reach an account tool even via a crafted
        request, regardless of what the model itself would or wouldn't
        attempt (available_tools() already omits them entirely for
        self.user is None, so this lookup fails on its own — no separate
        auth check needed here)."""
        for spec in self.available_tools():
            if spec.schema["function"]["name"] == name:
                if spec.needs_user:
                    return spec.handler(user=self.user, **arguments)
                return spec.handler(**arguments)
        raise ValueError(f"Unknown or unavailable tool for this session: {name}")
