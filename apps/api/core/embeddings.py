# apps/api/core/embeddings.py
# Chatbot Phase 1 — the embedding pipeline shared by the search endpoint,
# the CLI re-embedding script, and the model-comparison script, so there's
# exactly one implementation of "what text represents a book" and "how do
# we embed it."

from datetime import datetime, timezone

from openai import OpenAI
from supabase import Client

from core.config import OPENAI_API_KEY

DEFAULT_MODEL = "text-embedding-3-small"
DEFAULT_DIMENSIONS = 1536

_client: OpenAI | None = None


def get_openai_client() -> OpenAI:
    global _client
    if _client is None:
        if not OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY is not set — add a real key to .env before using search or embeddings")
        _client = OpenAI(api_key=OPENAI_API_KEY)
    return _client


def build_embedded_text(book: dict) -> str:
    """Plan 1.2's exact recipe: Title. Author. Subject headings.
    Description. Collection type. Call number. Never the accession
    number, shelf location, or availability — those change, and they add
    noise to semantic similarity; availability is joined live at query
    time instead."""
    parts = [
        book.get("title"),
        book.get("author"),
        book.get("subject"),
        book.get("abstract"),
        book.get("collection_type"),
        book.get("call_number"),
    ]
    return ". ".join(p for p in parts if p)


def embed_text(text: str, model: str = DEFAULT_MODEL) -> list[float]:
    client = get_openai_client()
    res = client.embeddings.create(model=model, input=text)
    return res.data[0].embedding


TRANSLATE_MODEL = "gpt-4o-mini"

_TRANSLATE_SYSTEM_PROMPT = (
    "Translate the following library search query to English. "
    "Keep book titles, author names, and call numbers as-is if unsure. "
    "Reply with ONLY the translated query, nothing else — no quotes, no explanation."
)


def translate_query_to_english(query: str) -> str:
    """Chatbot Phase 6 — the query-translation improvement (plan 6.3).
    One cheap chat completion, not a full embedding-model swap: search
    stays in English (book_embeddings/policy_chunks are English text),
    only the query gets translated before it's embedded. The chat
    model's actual reply to the student is unaffected — this only
    touches the retrieval query, not the conversation."""
    client = get_openai_client()
    res = client.chat.completions.create(
        model=TRANSLATE_MODEL,
        messages=[
            {"role": "system", "content": _TRANSLATE_SYSTEM_PROMPT},
            {"role": "user", "content": query},
        ],
    )
    translated = (res.choices[0].message.content or "").strip()
    return translated or query


def semantic_search(admin: Client, query: str, limit: int = 10) -> list[dict]:
    """Plan 1.4/1.5's hybrid search, minus availability-joining and
    accession redaction — those differ by caller (routers/search.py's
    public endpoint vs core/tools/catalog.py's chat tool), so each caller
    applies them itself. Returns raw book rows in rank order."""
    query_embedding = embed_text(query)
    ranked = admin.rpc("hybrid_search_books", {
        "query_embedding": query_embedding,
        "query_text": query,
        "match_count": limit,
    }).execute().data

    book_ids = [row["book_id"] for row in ranked]
    if not book_ids:
        return []

    books_res = admin.table("books").select("*").in_("id", book_ids).execute().data
    by_id = {b["id"]: b for b in books_res}
    # rpc() returns rank order, but a plain .in_() fetch doesn't preserve it.
    return [by_id[bid] for bid in book_ids if bid in by_id]


def reembed_books(admin: Client, force_all: bool = False) -> int:
    """Plan 1.6's re-embedding job. Skips books whose catalog row hasn't
    changed since they were last embedded (unless force_all, or the
    stored model differs from DEFAULT_MODEL). Returns the number
    re-embedded."""
    books = (
        admin.table("books")
        .select("id, title, author, subject, abstract, collection_type, call_number, updated_at")
        .execute()
    ).data
    existing = {
        row["book_id"]: row
        for row in admin.table("book_embeddings").select("book_id, model, updated_at").execute().data
    }

    updated = 0
    for book in books:
        prior = existing.get(book["id"])
        if not force_all and prior and prior["model"] == DEFAULT_MODEL and prior["updated_at"] >= book["updated_at"]:
            continue

        text = build_embedded_text(book)
        if not text:
            continue

        vector = embed_text(text)
        admin.table("book_embeddings").upsert({
            "book_id": book["id"],
            "embedding": vector,
            "embedded_text": text,
            "model": DEFAULT_MODEL,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
        updated += 1

    return updated
