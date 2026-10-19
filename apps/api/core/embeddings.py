# Turns books and search queries into embeddings for semantic search.

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
    """The text embedded for a book. Leaves out accession number, location
    and availability, which change and would add noise."""
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
    """Translates a search query to English, since the catalog and handbook
    are in English. Only affects the search, not the chatbot's reply."""
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


def semantic_search(admin: Client, query_embedding: list[float], query_text: str, limit: int = 10) -> list[dict]:
    """Hybrid (keyword + meaning) search. Returns raw book rows in rank
    order; callers add availability and hide accession numbers themselves.

    Takes the embedding as an argument so the caller can reuse it."""
    ranked = admin.rpc("hybrid_search_books", {
        "query_embedding": query_embedding,
        "query_text": query_text,
        "match_count": limit,
    }).execute().data

    book_ids = [row["book_id"] for row in ranked]
    if not book_ids:
        return []

    # Archived books are dropped here.
    books_res = admin.table("books").select("*").in_("id", book_ids).is_("archived_at", "null").execute().data
    by_id = {b["id"]: b for b in books_res}
    # rpc() returns rank order, but a plain .in_() fetch doesn't preserve it.
    return [by_id[bid] for bid in book_ids if bid in by_id]


def embed_single_book(admin: Client, book: dict) -> None:
    """Embeds a book right after it's created or edited, so search finds
    it straight away. Never raises: a failure must not block saving the book.
    """
    text = build_embedded_text(book)
    if not text:
        return
    try:
        vector = embed_text(text)
        admin.table("book_embeddings").upsert({
            "book_id": book["id"],
            "embedding": vector,
            "embedded_text": text,
            "model": DEFAULT_MODEL,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as e:
        print(f"embed_single_book: could not embed book {book.get('id')}: {e}")


def reembed_books(admin: Client, force_all: bool = False) -> int:
    """Re-embeds books that changed since their last embedding (or all, with
    force_all). Returns how many were re-embedded."""
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
