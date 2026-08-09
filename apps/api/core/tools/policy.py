"""Chatbot Phase 4 — the search_policy tool.

Wraps core/policy.py's retrieval over ingested handbook chunks. Distinct
from core/policy.py itself: that module owns ingestion/chunking, this
module is the model-facing search tool built on top of it. Every result
carries its section title so answers can cite it (plan 4.3: "Always
cite the section").
"""

from pydantic import BaseModel


class PolicyChunkResult(BaseModel):
    chunk_text: str
    section_title: str
    source_page: int | None = None


def search_policy(query: str) -> list[PolicyChunkResult]:
    """Tool handler for `search_policy`. Should call into
    core/policy.py's retrieval, not reimplement chunk lookup here."""
    raise NotImplementedError


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
