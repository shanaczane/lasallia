# apps/api/core/recommendations.py
# Recommendations plan, Phase 3 — content-based recommendations for one
# student. Reads book_similarities (Phase 2) and the student's own
# borrow/reservation history; never touches other students' data, so
# there's no cross-student signal here at all (that's Phase 4, gated on
# Phase 1's decision — content-only for now).
#
# No averaging: a student who reads both poetry and networking should
# get poetry AND networking recommendations, each traceable to the book
# that caused it. Averaging into one profile vector would blur that into
# neither, and would also make the reason string impossible to write
# honestly.

from dataclasses import dataclass, field
from datetime import datetime, timezone

from supabase import Client

# plan's source weighting table. Fulfilled/expired reservations are
# deliberately absent here: fulfilled becomes a loan (already covered by
# LOAN_WEIGHTS below, so counting it again here would double-weight the
# same real-world event), and expired is treated like cancelled — the
# student never actually got the book, so it shouldn't count as a signal
# they wanted it, same reasoning the plan gives for excluding cancelled.
LOAN_WEIGHTS = {"returned": 1.0, "active": 1.0, "overdue": 1.0}
ACTIVE_RESERVATION_STATUSES = {"pending", "ready"}
RESERVATION_WEIGHT = 0.7

RECENCY_HALF_LIFE_DAYS = 180
DIVERSITY_CAP_PER_CATEGORY = 3
DEFAULT_LIMIT = 10

# Same set routers/reservations.py and routers/holds.py already use to
# gate what can be borrowed at all — reused here rather than inventing a
# parallel "is_archived" concept the schema doesn't actually have.
# Recommending a book nobody can check out would be a worse bug than
# missing the plan's literal column name.
NON_BORROWABLE_COLLECTION_TYPES = {"Reference", "Thesis", "Capstone", "MTR", "Archives"}

# How close a second source's contribution has to be to the top
# contributor's to count as "comparable" in the reason string (plan:
# "if two or more sources contributed comparably"). Not specified
# numerically by the plan — chosen so "and 2 others" only fires when
# those others are genuinely close, not just nonzero.
COMPARABLE_CONTRIBUTION_RATIO = 0.7


@dataclass
class Recommendation:
    book_id: str
    score: float
    reason_book_id: str
    reason: str


@dataclass
class _Source:
    book_id: str
    weight: float  # base weight × recency decay, already combined
    verb: str  # "borrowed" or "reserved" — for the reason string


def _recency_decay(anchor_iso: str, now: datetime) -> float:
    anchor = datetime.fromisoformat(anchor_iso)
    days_since = max((now - anchor).total_seconds() / 86400, 0)
    return 0.5 ** (days_since / RECENCY_HALF_LIFE_DAYS)


def _collect_sources(admin: Client, student_id: str, now: datetime) -> dict[str, _Source]:
    """One _Source per distinct book_id the student has engaged with. If
    a book was engaged with more than once (e.g. borrowed, returned, then
    borrowed again), only the single strongest (weight × decay) event
    counts — summing every past engagement with the same book would
    reward re-borrow frequency, which isn't what this phase is scoring."""
    sources: dict[str, _Source] = {}

    def consider(book_id: str, base_weight: float, anchor_iso: str, verb: str) -> None:
        weight = base_weight * _recency_decay(anchor_iso, now)
        existing = sources.get(book_id)
        if existing is None or weight > existing.weight:
            sources[book_id] = _Source(book_id=book_id, weight=weight, verb=verb)

    loans = (
        admin.table("loans")
        .select("book_copy_id, status, borrowed_at")
        .eq("student_id", student_id)
        .execute()
    ).data
    copy_ids = list({l["book_copy_id"] for l in loans})
    copy_to_book: dict[str, str] = {}
    if copy_ids:
        copies = admin.table("book_copies").select("id, book_id").in_("id", copy_ids).execute().data
        copy_to_book = {c["id"]: c["book_id"] for c in copies}

    for l in loans:
        base_weight = LOAN_WEIGHTS.get(l["status"])
        book_id = copy_to_book.get(l["book_copy_id"])
        if base_weight is None or book_id is None:
            continue
        consider(book_id, base_weight, l["borrowed_at"], "borrowed")

    reservations = (
        admin.table("reservations")
        .select("book_id, status, requested_at")
        .eq("user_id", student_id)
        .execute()
    ).data
    for r in reservations:
        if r["status"] not in ACTIVE_RESERVATION_STATUSES:
            continue
        consider(r["book_id"], RESERVATION_WEIGHT, r["requested_at"], "reserved")

    return sources


def _excluded_book_ids(admin: Client, student_id: str, source_book_ids: set[str]) -> set[str]:
    """Plan's exclusion list, applied before ranking. Source books are
    already the student's borrow/reservation history, so they're folded
    straight in rather than re-derived — a book can't recommend past
    what the student already has."""
    excluded = set(source_book_ids)

    reservations = (
        admin.table("reservations")
        .select("book_id, status")
        .eq("user_id", student_id)
        .execute()
    ).data
    excluded |= {r["book_id"] for r in reservations if r["status"] in ACTIVE_RESERVATION_STATUSES}

    non_borrowable = (
        admin.table("books")
        .select("id")
        .in_("collection_type", list(NON_BORROWABLE_COLLECTION_TYPES))
        .execute()
    ).data
    excluded |= {b["id"] for b in non_borrowable}

    return excluded


def _build_reason(contributions: dict[str, float], titles: dict[str, str], verbs: dict[str, str]) -> tuple[str, str]:
    ranked = sorted(contributions.items(), key=lambda kv: kv[1], reverse=True)
    top_book_id, top_contribution = ranked[0]
    comparable = [bid for bid, c in ranked if c >= top_contribution * COMPARABLE_CONTRIBUTION_RATIO]

    top_title = titles.get(top_book_id, "a book you borrowed")
    verb = verbs.get(top_book_id, "borrowed")
    if len(comparable) == 1:
        reason = f"Because you {verb} {top_title}"
    else:
        others = len(comparable) - 1
        reason = f"Because you {verb} {top_title} and {others} other{'s' if others != 1 else ''}"
    return reason, top_book_id


def get_recommendations_for_student(admin: Client, student_id: str, limit: int = DEFAULT_LIMIT) -> list[Recommendation]:
    now = datetime.now(timezone.utc)
    sources = _collect_sources(admin, student_id, now)
    if not sources:
        return []

    source_ids = list(sources.keys())
    neighbor_rows = (
        admin.table("book_similarities")
        .select("book_id, neighbor_book_id, score")
        .in_("book_id", source_ids)
        .execute()
    ).data

    # candidate_book_id -> { source_book_id -> contribution }
    contributions: dict[str, dict[str, float]] = {}
    for row in neighbor_rows:
        source = sources.get(row["book_id"])
        if source is None:
            continue
        contribution = row["score"] * source.weight
        candidate_id = row["neighbor_book_id"]
        contributions.setdefault(candidate_id, {})[row["book_id"]] = contribution

    excluded = _excluded_book_ids(admin, student_id, set(source_ids))
    candidate_ids = [cid for cid in contributions if cid not in excluded]
    if not candidate_ids:
        return []

    needed_book_ids = set(candidate_ids) | set(source_ids)
    books = (
        admin.table("books")
        .select("id, title, category")
        .in_("id", list(needed_book_ids))
        .execute()
    ).data
    titles = {b["id"]: b["title"] for b in books}
    categories = {b["id"]: b.get("category") for b in books}
    verbs = {sid: s.verb for sid, s in sources.items()}

    scored: list[tuple[str, float, str, str]] = []
    for candidate_id in candidate_ids:
        cand_contributions = contributions[candidate_id]
        score = sum(cand_contributions.values())
        reason, reason_book_id = _build_reason(cand_contributions, titles, verbs)
        scored.append((candidate_id, score, reason_book_id, reason))

    # Deterministic order: score desc, then book_id as a stable tiebreak
    # so two candidates with an identical score don't reorder between
    # runs depending on incidental dict/DB iteration order.
    scored.sort(key=lambda t: (-t[1], t[0]))

    # Plan's diversity cap groups by "subject/classification" — that's
    # `books.subject` by name, but Phase 1's audit found it 0% populated
    # (docs/data-audit.md), which would put nearly every book in the
    # same empty-string bucket and collapse the cap to ~3 results total.
    # `category` is the field that's actually populated (General,
    # Reference, Story book, ...) and is genuinely a classification
    # field, just coarser — used here instead so the cap does what it's
    # meant to instead of accidentally gutting the list.
    results: list[Recommendation] = []
    category_counts: dict[str | None, int] = {}
    for candidate_id, score, reason_book_id, reason in scored:
        if len(results) >= limit:
            break
        category = categories.get(candidate_id)
        if category_counts.get(category, 0) >= DIVERSITY_CAP_PER_CATEGORY:
            continue
        category_counts[category] = category_counts.get(category, 0) + 1
        results.append(Recommendation(book_id=candidate_id, score=score, reason_book_id=reason_book_id, reason=reason))

    return results
