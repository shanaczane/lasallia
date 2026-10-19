# Compares OpenAI embedding models (3-small vs 3-large) by search hit rate
# at 5. Runs in memory and never writes to the database. Local multilingual
# models aren't compared (they'd need torch and a large download).
#
# Usage: venv/Scripts/python.exe evals/embedding_comparison.py

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so `core.*` resolves

import numpy as np

from core.embeddings import build_embedded_text, get_openai_client
from core.supabase import get_admin_client

MODELS = ["text-embedding-3-small", "text-embedding-3-large"]
TOP_K = 5
BATCH_SIZE = 100
QUERY_SET_PATH = Path(__file__).parent / "queries" / "embedding_comparison_v1.json"


def embed_batch(texts: list[str], model: str) -> np.ndarray:
    client = get_openai_client()
    vectors: list[list[float]] = []
    for i in range(0, len(texts), BATCH_SIZE):
        chunk = texts[i:i + BATCH_SIZE]
        res = client.embeddings.create(model=model, input=chunk)
        vectors.extend(item.embedding for item in res.data)
    return np.array(vectors)


def cosine_top_k(query_vec: np.ndarray, book_vecs: np.ndarray, k: int) -> list[int]:
    query_norm = query_vec / np.linalg.norm(query_vec)
    book_norms = book_vecs / np.linalg.norm(book_vecs, axis=1, keepdims=True)
    scores = book_norms @ query_norm
    return list(np.argsort(-scores)[:k])


def main():
    admin = get_admin_client()
    books = (
        admin.table("books")
        .select("title, author, subject, abstract, collection_type, call_number")
        .execute()
    ).data
    titles = [b["title"] for b in books]
    texts = [build_embedded_text(b) for b in books]

    queries = json.loads(QUERY_SET_PATH.read_text(encoding="utf-8"))
    if len(queries) < 20:
        print(f"Note: {len(queries)} queries in the starter set — the plan wants ~20 "
              f"(half English, half Taglish) with real student phrasings before trusting these numbers.\n")

    for model in MODELS:
        print(f"=== {model} ===")
        book_vecs = embed_batch(texts, model)
        query_vecs = embed_batch([q["query"] for q in queries], model)

        hits_by_language: dict[str, list[int]] = {}
        for i, q in enumerate(queries):
            top_k = cosine_top_k(query_vecs[i], book_vecs, TOP_K)
            hit = 1 if q["expected_title"] in [titles[j] for j in top_k] else 0
            hits_by_language.setdefault(q.get("language", "unknown"), []).append(hit)

        all_hits = [h for hits in hits_by_language.values() for h in hits]
        print(f"  overall hit-rate@{TOP_K}: {sum(all_hits)}/{len(all_hits)} ({100 * sum(all_hits) / len(all_hits):.0f}%)")
        for language, hits in hits_by_language.items():
            print(f"  {language}: {sum(hits)}/{len(hits)} ({100 * sum(hits) / len(hits):.0f}%)")
        print()


if __name__ == "__main__":
    main()
