"""Chatbot tool: search the catalog.

Uses the same search as POST /search/semantic, plus a relevance filter.
"""

import re

import numpy as np

from core.embeddings import embed_text, semantic_search, translate_query_to_english
from core.supabase import get_admin_client
from routers.books import _apply_real_availability, _redact_for_patrons
from schemas.book import Book

DEFAULT_LIMIT = 5

# Curly quotes and dashes in titles, mapped to plain ones so a typed title
# still matches exactly.
_PUNCT_NORMALIZE = str.maketrans({
    "‘": "'", "’": "'",
    "“": '"', "”": '"',
    "–": "-", "—": "-",
})


def _normalize_for_match(text: str) -> str:
    """Removes spaces and plain-ifies punctuation so "Title : Subtitle" and
    "Title: Subtitle" compare equal. Only for matching, never display."""
    return re.sub(r"\s+", "", text.translate(_PUNCT_NORMALIZE)).lower()

# The search always returns something, even for unrelated queries. The
# chatbot must not present unrelated books as matches, so results are
# re-checked with real similarity and weak ones dropped.
SIMILARITY_THRESHOLD = 0.30


def _parse_vector(value) -> np.ndarray:
    # pgvector columns come back through PostgREST as a text literal like
    # "[0.01,-0.02,...]", not a JSON array.
    if isinstance(value, str):
        return np.array([float(x) for x in value.strip("[]").split(",")])
    return np.array(value)


def search_catalog(query: str, limit: int = DEFAULT_LIMIT, translate: bool = False) -> list[Book]:
    """Searches the catalog and drops irrelevant results. Accession numbers
    are always hidden, since the chatbot must never reveal them.

    `translate` turns the query into English first. The query is embedded
    once and reused for both the search and the relevance check.
    """
    admin = get_admin_client()
    effective_query = translate_query_to_english(query) if translate else query

    query_vec = _parse_vector(embed_text(effective_query))
    query_vec_norm = np.linalg.norm(query_vec)
    query_match = _normalize_for_match(effective_query)

    ordered = semantic_search(admin, query_vec.tolist(), effective_query, limit)
    if not ordered:
        return []

    book_ids = [b["id"] for b in ordered]

    embeds = admin.table("book_embeddings").select("book_id, embedding").in_("book_id", book_ids).execute().data
    similarity_by_id = {}
    for row in embeds:
        book_vec = _parse_vector(row["embedding"])
        similarity_by_id[row["book_id"]] = float(query_vec @ book_vec / (query_vec_norm * np.linalg.norm(book_vec)))

    def is_relevant(book: dict) -> bool:
        # Always keep exact title or call-number matches: short exact
        # strings can score low on similarity even when they're correct.
        if query_match == _normalize_for_match(book.get("title") or "") or query_match == _normalize_for_match(book.get("call_number") or ""):
            return True
        return similarity_by_id.get(book["id"], 0.0) >= SIMILARITY_THRESHOLD

    ordered = [b for b in ordered if is_relevant(b)]
    if not ordered:
        return []

    book_ids = [b["id"] for b in ordered]
    copies_res = admin.table("book_copies").select("book_id, status").in_("book_id", book_ids).execute().data
    ordered = _apply_real_availability(ordered, copies_res)
    ordered = _redact_for_patrons(ordered, None)

    return [Book(**b) for b in ordered]


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
