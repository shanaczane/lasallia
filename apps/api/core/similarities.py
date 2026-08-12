# apps/api/core/similarities.py
# Recommendations plan, Phase 2 — TF-IDF item-item similarity. Content
# only: this file never looks at loans/reservations, just book text. The
# collaborative signal (Phase 4) lives entirely in a separate table,
# blended in later — keeping this file blind to borrow history is what
# lets Phase 3 use it standalone if Phase 4 never gets built (Phase 1's
# audit found only 1 real loan in the whole database, so it hasn't).

from dataclasses import dataclass, field

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from supabase import Client

TOP_N_NEIGHBORS = 30
MIN_SCORE = 0.05

# Plan 2's exact recipe: repeating a field in the blob is the
# crude-but-correct way to weight it in TF-IDF — title matters most,
# subject/author next, description least (and, per Phase 1's audit,
# subject is ~0% populated right now, so that weight is currently inert
# in practice, not by any bug here).
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
    """Full rebuild — computes every book's top 30 neighbors from scratch
    and replaces book_similarities in one atomic call (see migration
    0017's replace_book_similarities). No incremental logic; the catalog
    is small enough that a full recompute is cheap and a lot simpler to
    reason about than tracking what changed."""
    books = admin.table("books").select("id, title, author, subject, abstract").execute().data

    texts = [build_feature_text(b) for b in books]
    usable_idx = [i for i, t in enumerate(texts) if t.strip()]
    skipped_book_ids = [books[i]["id"] for i, t in enumerate(texts) if not t.strip()]

    if len(usable_idx) < 2:
        # Nothing meaningful to compare — every book's neighbor list
        # would be empty anyway, so skip straight to an empty rebuild
        # rather than letting TfidfVectorizer fail on a near-empty corpus.
        admin.rpc("replace_book_similarities", {"rows": []}).execute()
        return RebuildResult(updated=0, skipped_book_ids=[b["id"] for b in books])

    usable_books = [books[i] for i in usable_idx]
    usable_texts = [texts[i] for i in usable_idx]

    vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=2, max_features=20000, stop_words="english")
    matrix = vectorizer.fit_transform(usable_texts)

    # A book whose every term got dropped by min_df=2 (every word in its
    # blob is unique to it, so nothing crosses the "appears in ≥2 docs"
    # bar) ends up as an all-zero row — cosine similarity against it is
    # meaningless, not just low. Logged as skipped rather than stored
    # with a neighbor list that's really just noise.
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
