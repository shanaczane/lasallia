# Finds similar books from their text (title, author, description) using
# TF-IDF. Uses book text only, never borrowing history.

from dataclasses import dataclass, field

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from supabase import Client

TOP_N_NEIGHBORS = 30
MIN_SCORE = 0.05

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
    book_similarities table. The catalog is small enough for a full rebuild."""
    books = admin.table("books").select("id, title, author, subject, abstract").execute().data

    texts = [build_feature_text(b) for b in books]
    usable_idx = [i for i, t in enumerate(texts) if t.strip()]
    skipped_book_ids = [books[i]["id"] for i, t in enumerate(texts) if not t.strip()]

    if len(usable_idx) < 2:
        # Too few books to compare; TF-IDF would fail.
        admin.rpc("replace_book_similarities", {"rows": []}).execute()
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

    sim = cosine_similarity(matrix)

    rows: list[dict] = []
    updated = 0
    for i, book in enumerate(usable_books):
        if i in zero_rows:
            continue
        scores = sim[i].copy()
        scores[i] = -1  # exclude self
        for j in zero_rows:
            scores[j] = -1  # exclude neighbors with no usable text of their own

        ranked = np.argsort(scores)[::-1]
        neighbors = [(j, scores[j]) for j in ranked if scores[j] > MIN_SCORE][:TOP_N_NEIGHBORS]

        for rank, (j, score) in enumerate(neighbors, start=1):
            rows.append({
                "book_id": book["id"],
                "neighbor_book_id": usable_books[j]["id"],
                "score": float(score),
                "rank": rank,
            })
        updated += 1

    admin.rpc("replace_book_similarities", {"rows": rows}).execute()
    return RebuildResult(updated=updated, skipped_book_ids=skipped_book_ids)
