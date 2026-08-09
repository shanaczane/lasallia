"""Chatbot Phase 3 — the get_book_details tool.

Returns the full catalog record for one title. When the description is
empty, the caller (the chat orchestration layer, using the system
prompt) must fall back to the honest "catalog has no description"
response (plan 3.3) — this function's job is only to return what's
actually in the record, never to fill gaps from model knowledge.
"""

from schemas.book import Book


def get_book_details(book_id: str) -> Book:
    """Tool handler for `get_book_details`. Full bibliographic record:
    description, subject headings, edition, year, publisher, collection
    type, call number, availability."""
    raise NotImplementedError


TOOL_SCHEMA: dict = {
    "type": "function",
    "function": {
        "name": "get_book_details",
        "description": "Get the full catalog record for one book by id, including its description, subject headings, and current availability.",
        "parameters": {
            "type": "object",
            "properties": {
                "book_id": {"type": "string", "description": "The book's catalog id, from a prior search_catalog result."},
            },
            "required": ["book_id"],
        },
    },
}
