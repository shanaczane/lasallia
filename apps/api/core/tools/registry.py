"""Builds the chatbot's tool list for one request and runs tool calls.

Two security rules live here:
- Account tools are only included for logged-in users. Guests never get them.
- Tools that need the caller's identity get `user` from the server, never
  as an argument the model can fill in.
"""

from dataclasses import dataclass
from typing import Any, Callable

from core.tools import account, book_details, catalog, course_recommendations, hours, new_arrivals, policy
from schemas.auth import UserProfile


@dataclass
class ToolSpec:
    """A tool's OpenAI schema plus its Python handler.

    The schema must never have an identity parameter (student_id, user_id).
    If `needs_user` is true, dispatch() passes the logged-in `user` itself.
    """

    schema: dict[str, Any]
    handler: Callable[..., Any]
    needs_user: bool = False


class ToolRegistry:
    """Built once per chat request. `user` is None for guests."""

    def __init__(self, user: UserProfile | None):
        self.user = user

    def available_tools(self) -> list[ToolSpec]:
        """Tools this session may call. Account tools are only added for
        logged-in users."""
        tools = [
            ToolSpec(schema=catalog.TOOL_SCHEMA, handler=catalog.search_catalog),
            ToolSpec(schema=new_arrivals.TOOL_SCHEMA, handler=new_arrivals.get_new_arrivals),
            ToolSpec(schema=book_details.TOOL_SCHEMA, handler=book_details.get_book_details),
            ToolSpec(schema=policy.TOOL_SCHEMA, handler=policy.search_policy),
            ToolSpec(schema=hours.TOOL_SCHEMA, handler=hours.get_library_hours),
        ]
        if self.user is not None:
            tools += [
                ToolSpec(schema=account.GET_MY_LOANS_SCHEMA, handler=account.get_my_loans, needs_user=True),
                ToolSpec(schema=account.GET_MY_FINES_SCHEMA, handler=account.get_my_fines, needs_user=True),
                ToolSpec(schema=account.GET_MY_HISTORY_SCHEMA, handler=account.get_my_history, needs_user=True),
            ]
            if self.user.program:
                tools.append(ToolSpec(
                    schema=course_recommendations.TOOL_SCHEMA,
                    handler=course_recommendations.recommend_for_my_course,
                    needs_user=True,
                ))
        return tools

    def dispatch(self, name: str, arguments: dict[str, Any]) -> Any:
        """Runs a tool, but only if it's in this session's tool list. That
        is what stops a guest from calling an account tool."""
        for spec in self.available_tools():
            if spec.schema["function"]["name"] == name:
                if spec.needs_user:
                    return spec.handler(user=self.user, **arguments)
                return spec.handler(**arguments)
        raise ValueError(f"Unknown or unavailable tool for this session: {name}")
