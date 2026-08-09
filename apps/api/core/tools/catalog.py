"""Chatbot Phase 2 — the search_catalog tool.

Wraps core/embeddings.py's retrieval pipeline; does not reimplement it.
Retrieval must stay usable without this tool — routers/search.py's
POST /search/semantic calls the same underlying pipeline directly, with
no LLM involved, and that must keep working on its own.
"""

from schemas.book import Book


def search_catalog(query: str) -> list[Book]:
    """Tool handler for `search_catalog`. Should call into
    core/embeddings.py the same way routers/search.py's semantic_search
    does, not duplicate that logic here."""
    raise NotImplementedError


TOOL_SCHEMA: dict = {
    "type": "function",
    "function": {
        "name": "search_catalog",
        "description": "Search the DLSL Learning Resource Center catalog for books matching a natural-language query. Returns real catalog entries only.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The student's search phrase, in whatever language (including Taglish) they used.",
                },
            },
            "required": ["query"],
        },
    },
}
