# apps/api/evals/run_recsys_eval.py
# Recommendations plan, Phase 8 — offline evaluation: hides each
# qualifying student's most recent 20% of borrows, asks each arm to
# predict them from what's left, and reports hit rate/precision/coverage/
# diversity at k=5 and k=10. Built for real ahead of having enough data
# to run it for real — see the N=0 guard in run_eval() below, which is
# what keeps this honest rather than a script nobody remembers to write
# once there's finally data.
#
# Two arms from the plan are deliberately NOT built here:
#   - Hybrid (alpha sweep): Phase 4 (co-occurrence) was never built —
#     docs/data-audit.md found median borrows/student = 1, too sparse to
#     trust a collaborative signal. Reported as a skipped row in the
#     output table, never a fabricated number.
#   - Content-only (embeddings): optional in the plan, and costs real
#     OpenAI calls on every run. core/embeddings.py:embed_text already
#     exists if this gets added later.
#
# Content-only (TF-IDF) here is a simplified offline replay of
# core/recommendations.py:get_recommendations_for_student — same
# "sum of cosine similarity to every source book" aggregation, without
# recency decay (no meaningful "now" in a historical replay) or the
# diversity cap (adds complexity without changing what this measures).
#
# No live server needed — pure offline computation against the DB +
# sklearn, same invocation style as jobs/rebuild_similarities.py.
#
# Usage: venv/Scripts/python.exe evals/run_recsys_eval.py

import random
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so `core.*` resolves

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from supabase import Client

from core.recommendations import NON_BORROWABLE_COLLECTION_TYPES
from core.similarities import build_feature_text
from core.supabase import get_admin_client

RESULTS_PATH = Path(__file__).resolve().parent.parent.parent.parent / "docs" / "recsys-evaluation.md"

MIN_BORROWS = 5
HOLDOUT_FRAC = 0.2
K_VALUES = (5, 10)
RANDOM_SEED = 42


# ─── Data loading ────────────────────────────────────────────────────────

def load_completed_loans(admin: Client) -> list[dict]:
    rows = (
        admin.table("loans")
        .select("student_id, borrowed_at, book_copies(book_id)")
        .order("borrowed_at")
        .execute()
    ).data
    loans = []
    for r in rows:
        book_id = (r.get("book_copies") or {}).get("book_id")
        if not book_id:
            continue
        loans.append({"student_id": r["student_id"], "book_id": book_id, "borrowed_at": r["borrowed_at"]})
    return loans


def load_catalog(admin: Client) -> list[dict]:
    return admin.table("books").select("id, title, author, subject, abstract, collection_type").execute().data


def borrowable_book_ids(catalog: list[dict]) -> list[str]:
    return sorted(b["id"] for b in catalog if b.get("collection_type") not in NON_BORROWABLE_COLLECTION_TYPES)


# ─── Temporal split ──────────────────────────────────────────────────────

def temporal_split(
    loans: list[dict], min_borrows: int = MIN_BORROWS, holdout_frac: float = HOLDOUT_FRAC
) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    """Per student: sort by borrowed_at, hold out the most recent
    `holdout_frac`. A student below `min_borrows` total is excluded
    entirely, not partially split — this is the count reported as N."""
    by_student: dict[str, list[dict]] = defaultdict(list)
    for loan in loans:
        by_student[loan["student_id"]].append(loan)

    train: dict[str, list[str]] = {}
    test: dict[str, list[str]] = {}
    for student_id, student_loans in by_student.items():
        if len(student_loans) < min_borrows:
            continue
        ordered = sorted(student_loans, key=lambda l: l["borrowed_at"])
        n_test = max(1, round(len(ordered) * holdout_frac))
        train[student_id] = [l["book_id"] for l in ordered[:-n_test]]
        test[student_id] = [l["book_id"] for l in ordered[-n_test:]]
    return train, test


# ─── TF-IDF (shared by the content arm and the diversity metric) ────────

def build_tfidf(catalog: list[dict]) -> tuple[list[str], np.ndarray]:
    texts = [build_feature_text(b) for b in catalog]
    vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=2, max_features=20000, stop_words="english")
    matrix = vectorizer.fit_transform(texts)
    return [b["id"] for b in catalog], matrix


# ─── Arms ────────────────────────────────────────────────────────────────

def arm_random(train: dict[str, list[str]], catalog_ids: list[str], k: int, rng: random.Random) -> dict[str, list[str]]:
    recs = {}
    for student_id, train_ids in train.items():
        pool = [b for b in catalog_ids if b not in set(train_ids)]
        recs[student_id] = rng.sample(pool, min(k, len(pool)))
    return recs


def arm_most_popular(train: dict[str, list[str]], catalog_ids: list[str], k: int) -> dict[str, list[str]]:
    """Most-borrowed-in-train — mirrors core/recommendations.py's
    _borrow_counts/get_popular_recommendations, but computed strictly
    from this eval's train split, never the live popular_recommendations
    table (which would mix in data outside this experiment's boundary)."""
    counts: dict[str, int] = defaultdict(int)
    for train_ids in train.values():
        for book_id in train_ids:
            counts[book_id] += 1
    ranked = sorted(catalog_ids, key=lambda b: (-counts.get(b, 0), b))

    recs = {}
    for student_id, train_ids in train.items():
        seen = set(train_ids)
        recs[student_id] = [b for b in ranked if b not in seen][:k]
    return recs


def arm_content_tfidf(
    train: dict[str, list[str]], book_ids: list[str], matrix: np.ndarray, k: int
) -> dict[str, list[str]]:
    idx = {b: i for i, b in enumerate(book_ids)}
    sim = cosine_similarity(matrix)

    recs = {}
    for student_id, train_ids in train.items():
        source_idxs = [idx[b] for b in train_ids if b in idx]
        if not source_idxs:
            recs[student_id] = []
            continue
        scores = sim[source_idxs].sum(axis=0)
        seen = {idx[b] for b in train_ids if b in idx}
        ranked = np.argsort(scores)[::-1]
        picked = [i for i in ranked if i not in seen][:k]
        recs[student_id] = [book_ids[i] for i in picked]
    return recs


# ─── Metrics ─────────────────────────────────────────────────────────────

def hit_rate_at_k(recs: dict[str, list[str]], test: dict[str, list[str]], k: int) -> float:
    hits = [1 if set(recs.get(s, [])[:k]) & set(relevant) else 0 for s, relevant in test.items()]
    return sum(hits) / len(hits) if hits else 0.0


def precision_at_k(recs: dict[str, list[str]], test: dict[str, list[str]], k: int) -> float:
    values = []
    for student_id, relevant in test.items():
        topk = recs.get(student_id, [])[:k]
        values.append(len(set(topk) & set(relevant)) / len(topk) if topk else 0.0)
    return sum(values) / len(values) if values else 0.0


def catalog_coverage(recs: dict[str, list[str]], catalog_size: int, k: int) -> float:
    recommended: set[str] = set()
    for items in recs.values():
        recommended |= set(items[:k])
    return len(recommended) / catalog_size if catalog_size else 0.0


def intra_list_diversity(recs: dict[str, list[str]], book_ids: list[str], matrix: np.ndarray, k: int) -> float:
    idx = {b: i for i, b in enumerate(book_ids)}
    sim = cosine_similarity(matrix)

    per_student = []
    for items in recs.values():
        idxs = [idx[b] for b in items[:k] if b in idx]
        if len(idxs) < 2:
            continue
        pairs = [1 - sim[idxs[i], idxs[j]] for i in range(len(idxs)) for j in range(i + 1, len(idxs))]
        per_student.append(sum(pairs) / len(pairs))
    return sum(per_student) / len(per_student) if per_student else 0.0


# ─── Reporting ───────────────────────────────────────────────────────────

def write_no_data_report(n_total_loans: int) -> None:
    lines = [
        "# Recommender Evaluation — Recommendations Phase 8",
        "",
        "Generated by `apps/api/evals/run_recsys_eval.py`. See "
        "`docs/lasallia-recommendations-build-plan.md` Phase 8 for the methodology.",
        "",
        "## Result",
        "",
        f"**N = 0 qualifying students.** The offline protocol needs students with at least "
        f"{MIN_BORROWS} completed borrows each, to hold out the most recent {HOLDOUT_FRAC:.0%} as a "
        f"test set. There are {n_total_loans} completed loan(s) in the whole database right now.",
        "",
        "Nothing was evaluated — no arm ran, no metric was computed. This is not a failure; it means "
        "there isn't enough real usage yet to evaluate against. Re-run this script "
        "(`venv/Scripts/python.exe evals/run_recsys_eval.py`) once more borrow history has accumulated. "
        "Phase 9's click-through logging (`recommendation_events`) is a separate, earlier signal — "
        "impressions and clicks, not completed borrows — and isn't a substitute for real loan history here.",
        "",
    ]
    RESULTS_PATH.write_text("\n".join(lines), encoding="utf-8")


def write_report(n_students: int, n_total_loans: int, results: dict[str, dict[int, dict[str, float]]]) -> None:
    lines = [
        "# Recommender Evaluation — Recommendations Phase 8",
        "",
        f"Generated by `apps/api/evals/run_recsys_eval.py`. N = {n_students} student(s) with "
        f"≥{MIN_BORROWS} borrows each, out of {n_total_loans} total completed loan(s) in the DB. "
        f"Temporal split: each qualifying student's most recent {HOLDOUT_FRAC:.0%} of borrows held out "
        f"as the test set, never used for training any arm.",
        "",
        "## Results",
        "",
        "| Arm | k | Hit rate@k | Precision@k | Catalog coverage | Intra-list diversity |",
        "|---|---|---|---|---|---|",
    ]
    for arm_name, per_k in results.items():
        for k, m in per_k.items():
            lines.append(
                f"| {arm_name} | {k} | {m['hit_rate']:.2f} | {m['precision']:.2f} | "
                f"{m['coverage']:.1%} | {m['diversity']:.2f} |"
            )
    lines.append("| Hybrid (α sweep) | — | skipped — Phase 4 not built, see `docs/data-audit.md` | | | |")
    lines += [
        "",
        "## Notes",
        "",
        "- Content-only (TF-IDF) is a simplified offline replay of the production scorer "
        "(`core/recommendations.py:get_recommendations_for_student`) — same summed-similarity "
        "aggregation, without recency decay or the diversity cap (see this script's header comment "
        "for why).",
        "- Content-only (embeddings) was not run this pass — optional per the plan, and costs real "
        "OpenAI calls per run.",
        "",
    ]
    RESULTS_PATH.write_text("\n".join(lines), encoding="utf-8")


# ─── Main ────────────────────────────────────────────────────────────────

def run_eval(admin: Client) -> None:
    loans = load_completed_loans(admin)
    train, test = temporal_split(loans)
    n_students = len(train)

    if n_students == 0:
        write_no_data_report(len(loans))
        print(
            f"N=0 qualifying students (need >={MIN_BORROWS} borrows each; {len(loans)} total loan(s) "
            f"in the DB). Wrote docs/recsys-evaluation.md with this finding — nothing to evaluate yet."
        )
        return

    catalog = load_catalog(admin)
    catalog_ids = borrowable_book_ids(catalog)
    book_ids, matrix = build_tfidf(catalog)
    max_k = max(K_VALUES)
    rng = random.Random(RANDOM_SEED)

    arms = {
        "Random": arm_random(train, catalog_ids, max_k, rng),
        "Most-popular": arm_most_popular(train, catalog_ids, max_k),
        "Content-only (TF-IDF)": arm_content_tfidf(train, book_ids, matrix, max_k),
    }

    results = {
        arm_name: {
            k: {
                "hit_rate": hit_rate_at_k(recs, test, k),
                "precision": precision_at_k(recs, test, k),
                "coverage": catalog_coverage(recs, len(catalog_ids), k),
                "diversity": intra_list_diversity(recs, book_ids, matrix, k),
            }
            for k in K_VALUES
        }
        for arm_name, recs in arms.items()
    }

    write_report(n_students, len(loans), results)
    print(f"N={n_students} qualifying student(s). Wrote docs/recsys-evaluation.md.")


if __name__ == "__main__":
    run_eval(get_admin_client())
