"""Chatbot tool: search the LRC handbook.

core/policy.py loads the handbook; this searches it. Each result includes
its section title so answers can cite it.
"""

from pydantic import BaseModel

from core.embeddings import embed_text, translate_query_to_english
from core.supabase import get_admin_client

DEFAULT_LIMIT = 5

# The RPC's score is a real cosine similarity, so we can filter on it directly.
SIMILARITY_THRESHOLD = 0.25


class PolicyChunkResult(BaseModel):
    chunk_text: str
    section_title: str
    source_page: int | None = None


def search_policy(query: str, limit: int = DEFAULT_LIMIT, translate: bool = False) -> list[PolicyChunkResult]:
    """Searches handbook chunks with the search_policy_chunks RPC.
    `translate` turns a non-English query into English first."""
    admin = get_admin_client()
    effective_query = translate_query_to_english(query) if translate else query
    query_embedding = embed_text(effective_query)
    rows = admin.rpc("search_policy_chunks", {
        "query_embedding": query_embedding,
        "match_count": limit,
    }).execute().data

    return [
        PolicyChunkResult(chunk_text=r["chunk_text"], section_title=r["section_title"], source_page=r["source_page"])
        for r in rows
        if r["score"] >= SIMILARITY_THRESHOLD
    ]


TOOL_SCHEMA: dict = {
    "type": "function",
    "function": {
        "name": "search_policy",
        "description": "Search the LRC handbook for policy answers: borrowing limits, fine rates, guest requirements, and similar rules. Not for opening hours — use get_library_hours.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
            },
            "required": ["query"],
        },
    },
}
