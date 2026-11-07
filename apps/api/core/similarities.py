# Finds similar books from their text (title, author, description) using
# TF-IDF. Uses book text only, never borrowing history.

from dataclasses import dataclass, field

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from supabase import Client

from core.paging import fetch_all_rows

TOP_N_NEIGHBORS = 30
MIN_SCORE = 0.05

# Similarity is worked out for this many books at a time, so memory grows
# with the catalog, not with its square. The scores are the same.
CHUNK_BOOKS = 256
# Rows sent to the database per call.
WRITE_BATCH_ROWS = 5000

# Repeating a field gives it more weight: title counts most, then subject
# and author, then description.
_TITLE_WEIGHT = 3
_SUBJECT_WEIGHT = 2
_AUTHOR_WEIGHT = 2
_DESCRIPTION_WEIGHT = 1


def build_feature_text(book: dict) -> str:
    parts: list[str] = []
    if book.get("title"):
        parts += [book["title"]] * _TITLE_WEIGHT
    if book.get("subject"):
        parts += [book["subject"]] * _SUBJECT_WEIGHT
    if book.get("author"):
        parts += [book["author"]] * _AUTHOR_WEIGHT
    if book.get("abstract"):
        parts += [book["abstract"]] * _DESCRIPTION_WEIGHT
    return " ".join(parts)


@dataclass
class RebuildResult:
    updated: int
    skipped_book_ids: list[str] = field(default_factory=list)


def rebuild_similarities(admin: Client) -> RebuildResult:
    """Recomputes every book's top 30 similar books and replaces the whole
    book_similarities table. Rows are staged in batches and published in one
    transaction, so the live table stays whole if this stops partway."""
    books = fetch_all_rows(lambda: admin.table("books").select("id, title, author, subject, abstract").order("id"))

    texts = [build_feature_text(b) for b in books]
    usable_idx = [i for i, t in enumerate(texts) if t.strip()]
    skipped_book_ids = [books[i]["id"] for i, t in enumerate(texts) if not t.strip()]

    if len(usable_idx) < 2:
        # Too few books to compare; TF-IDF would fail.
        admin.rpc("begin_book_similarities_rebuild", {}).execute()
        admin.rpc("publish_book_similarities", {}).execute()
        return RebuildResult(updated=0, skipped_book_ids=[b["id"] for b in books])

    usable_books = [books[i] for i in usable_idx]
    usable_texts = [texts[i] for i in usable_idx]

    vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=2, max_features=20000, stop_words="english")
    matrix = vectorizer.fit_transform(usable_texts)

    # Books whose words appear in no other book end up with no usable
    # terms; skip them instead of storing meaningless neighbors.
    row_norms = np.asarray(matrix.power(2).sum(axis=1)).ravel()
    zero_rows = {i for i, n in enumerate(row_norms) if n == 0}
    for i in zero_rows:
        skipped_book_ids.append(usable_books[i]["id"])

    admin.rpc("begin_book_similarities_rebuild", {}).execute()

    rows: list[dict] = []
    updated = 0
    zero_columns = list(zero_rows)
    for chunk_start in range(0, len(usable_books), CHUNK_BOOKS):
        chunk_scores = cosine_similarity(matrix[chunk_start:chunk_start + CHUNK_BOOKS], matrix)
        for offset, scores in enumerate(chunk_scores):
            i = chunk_start + offset
            if i in zero_rows:
                continue
            scores[i] = -1  # exclude self
            scores[zero_columns] = -1  # exclude neighbors with no usable text of their own

            ranked = np.argsort(scores)[::-1]
            neighbors = []
            for j in ranked:
                if scores[j] <= MIN_SCORE or len(neighbors) == TOP_N_NEIGHBORS:
                    break
                neighbors.append((j, scores[j]))

            for rank, (j, score) in enumerate(neighbors, start=1):
                rows.append({
                    "book_id": usable_books[i]["id"],
                    "neighbor_book_id": usable_books[j]["id"],
                    "score": float(score),
                    "rank": rank,
                })
            updated += 1

        if len(rows) >= WRITE_BATCH_ROWS:
            admin.rpc("stage_book_similarities", {"rows": rows}).execute()
            rows = []

    if rows:
        admin.rpc("stage_book_similarities", {"rows": rows}).execute()
    admin.rpc("publish_book_similarities", {}).execute()
    return RebuildResult(updated=updated, skipped_book_ids=skipped_book_ids)
