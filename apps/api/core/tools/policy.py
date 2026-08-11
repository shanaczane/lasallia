"""Chatbot Phase 4 — the search_policy tool.

Wraps core/policy.py's retrieval over ingested handbook chunks. Distinct
from core/policy.py itself: that module owns ingestion/chunking, this
module is the model-facing search tool built on top of it. Every result
carries its section title so answers can cite it (plan 4.3: "Always
cite the section").
"""

from pydantic import BaseModel

from core.embeddings import embed_text
from core.supabase import get_admin_client

DEFAULT_LIMIT = 5

# search_policy_chunks' score is a real cosine similarity (1 - distance),
# not RRF's rank-based score (see core/tools/catalog.py's SIMILARITY_THRESHOLD
# for why that distinction matters) — so this can threshold directly on
# the RPC's own score, no separate re-embedding-and-comparing step needed.
SIMILARITY_THRESHOLD = 0.25


class PolicyChunkResult(BaseModel):
    chunk_text: str
    section_title: str
    source_page: int | None = None


def search_policy(query: str, limit: int = DEFAULT_LIMIT) -> list[PolicyChunkResult]:
    """Tool handler for `search_policy`. Calls into policy_chunks via the
    search_policy_chunks RPC (migration 0015) — core/policy.py owns
    ingestion/chunking, not lookup, so that logic isn't duplicated here."""
    admin = get_admin_client()
    query_embedding = embed_text(query)
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
        "description": "Search the LRC handbook for policy answers: borrowing limits, fine rates, guest requirements, hours, and similar rules.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
            },
            "required": ["query"],
        },
    },
}
