"""Chatbot Phase 2 — the search_catalog tool.

Wraps core/embeddings.py's retrieval pipeline; does not reimplement it.
Retrieval must stay usable without this tool — routers/search.py's
POST /search/semantic calls the same underlying pipeline directly, with
no LLM involved, and that must keep working on its own.
"""

import re

import numpy as np

from core.embeddings import embed_text, semantic_search, translate_query_to_english
from core.supabase import get_admin_client
from routers.books import _apply_real_availability, _redact_accession
from schemas.book import Book

DEFAULT_LIMIT = 5

# A handful of Unicode punctuation variants (smart quotes, en/em dashes)
# that show up in titles extracted from Word/PDF sources (e.g. "Kozier &
# ERB's" with a curly apostrophe) but that a student retyping the title
# themselves almost never reproduces — normalized to their ASCII
# equivalent before the exact-match check below.
_PUNCT_NORMALIZE = str.maketrans({
    "‘": "'", "’": "'",
    "“": '"', "”": '"',
    "–": "-", "—": "-",
})


def _normalize_for_match(text: str) -> str:
    """Collapses whitespace/punctuation-spacing differences for the exact
    title/call-number comparison below — "Title : Subtitle" vs "Title:
    Subtitle" (or any other spacing around punctuation) must still count
    as the same title. Whitespace is removed entirely rather than just
    collapsed, since even a single stray space changes the comparison
    otherwise; only used for this equality check, never for display."""
    return re.sub(r"\s+", "", text.translate(_PUNCT_NORMALIZE)).lower()

# Reciprocal Rank Fusion's score is purely rank-based (1/(60+rank)) — it
# always hands back *something* in top-N order, even when nothing is
# actually related to the query, because rank has no absolute notion of
# "no good match" (measured: an unrelated query like "Harry Potter" scores
# its #1 hit identically to a genuinely relevant query's #1 hit). Plan
# Principle 1 ("ground everything, invent nothing") means the chatbot
# specifically cannot hand the model filler results it might describe as
# real. So this tool re-checks with real cosine similarity on top of the
# RPC's fused ranking. The plain /search/semantic endpoint is untouched —
# a search page showing near-misses instead of a blank page is normal and
# fine; a chatbot asserting "I found this" about an unrelated book is not.
SIMILARITY_THRESHOLD = 0.30


def _parse_vector(value) -> np.ndarray:
    # pgvector columns come back through PostgREST as a text literal like
    # "[0.01,-0.02,...]", not a JSON array.
    if isinstance(value, str):
        return np.array([float(x) for x in value.strip("[]").split(",")])
    return np.array(value)


def search_catalog(query: str, limit: int = DEFAULT_LIMIT, translate: bool = False) -> list[Book]:
    """Tool handler for `search_catalog`. Same pipeline as
    routers/search.py's POST /search/semantic, plus a relevance filter
    (see SIMILARITY_THRESHOLD above) that endpoint doesn't need. Accession
    numbers are always redacted here regardless of caller — plan 2.2
    forbids the chatbot from disclosing them unconditionally, unlike the
    catalog page's librarian carve-out.

    `translate` (Phase 6, plan 6.3) — when true, the query is translated
    to English *once* here and that translated string is used for every
    embedding/search call below (semantic_search's hybrid RPC, and this
    function's own separate relevance-check embedding), so nothing ends
    up comparing an English book embedding against a non-English query
    vector inconsistently. Defaults to False — purely additive, decided
    by evals/run_eval.py's A/B, not a behavior change on its own.
    """
    admin = get_admin_client()
    effective_query = translate_query_to_english(query) if translate else query

    ordered = semantic_search(admin, effective_query, limit)
    if not ordered:
        return []

    book_ids = [b["id"] for b in ordered]

    query_vec = _parse_vector(embed_text(effective_query))
    query_vec_norm = np.linalg.norm(query_vec)
    query_match = _normalize_for_match(effective_query)

    embeds = admin.table("book_embeddings").select("book_id, embedding").in_("book_id", book_ids).execute().data
    similarity_by_id = {}
    for row in embeds:
        book_vec = _parse_vector(row["embedding"])
        similarity_by_id[row["book_id"]] = float(query_vec @ book_vec / (query_vec_norm * np.linalg.norm(book_vec)))

    def is_relevant(book: dict) -> bool:
        # Exact title/call-number matches are kept regardless of cosine
        # similarity — that's the RPC's own boost (short exact strings can
        # score low on raw embedding similarity despite being correct).
        # Normalized on both sides first so "Title : Subtitle" vs "Title:
        # Subtitle" (or a curly vs straight apostrophe) still counts as
        # the same title, not a miss that falls through to the threshold
        # check below.
        if query_match == _normalize_for_match(book.get("title") or "") or query_match == _normalize_for_match(book.get("call_number") or ""):
            return True
        return similarity_by_id.get(book["id"], 0.0) >= SIMILARITY_THRESHOLD

    ordered = [b for b in ordered if is_relevant(b)]
    if not ordered:
        return []

    book_ids = [b["id"] for b in ordered]
    copies_res = admin.table("book_copies").select("book_id, status").in_("book_id", book_ids).execute().data
    ordered = _apply_real_availability(ordered, copies_res)
    ordered = _redact_accession(ordered, None)

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
