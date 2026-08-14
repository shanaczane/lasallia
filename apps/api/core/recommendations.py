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

import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

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

# Phase 7 — rungs 2-4 of the cold-start ladder.
POPULAR_LOOKBACK_DAYS = 365
POPULAR_REASON = "Popular at the LRC"
RECENT_REASON = "Recently added"
# Plan's "≥3-student aggregation rule" for rung 2 — below this, a
# program's "most borrowed" list would just be reconstructable back to
# one or two individual students' actual borrowing history.
MIN_PROGRAM_STUDENTS = 3

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
    reason_book_id: str | None
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

    # book_copies embedded via the FK rather than a second round trip,
    # and loans+reservations fired concurrently rather than sequentially
    # — this whole path is on the hot request (Phase 5's <200ms budget),
    # not just the nightly job, so every extra network round trip here
    # is real latency a student waits on.
    with ThreadPoolExecutor(max_workers=2) as pool:
        loans_future = pool.submit(
            lambda: admin.table("loans")
            .select("status, borrowed_at, book_copies(book_id)")
            .eq("student_id", student_id)
            .execute()
        )
        reservations_future = pool.submit(
            lambda: admin.table("reservations")
            .select("book_id, status, requested_at")
            .eq("user_id", student_id)
            .execute()
        )
        loans = loans_future.result().data
        reservations = reservations_future.result().data

    for l in loans:
        base_weight = LOAN_WEIGHTS.get(l["status"])
        copy = l.get("book_copies")
        book_id = copy.get("book_id") if copy else None
        if base_weight is None or book_id is None:
            continue
        consider(book_id, base_weight, l["borrowed_at"], "borrowed")

    for r in reservations:
        if r["status"] not in ACTIVE_RESERVATION_STATUSES:
            continue
        consider(r["book_id"], RESERVATION_WEIGHT, r["requested_at"], "reserved")

    return sources


_non_borrowable_cache: tuple[float, set[str]] | None = None
NON_BORROWABLE_CACHE_TTL_SECONDS = 300


def _non_borrowable_book_ids(admin: Client) -> set[str]:
    """Catalog-wide, not student-specific, and changes only when a
    librarian edits a book's collection type — cached briefly so this
    endpoint isn't paying a network round trip for near-static data on
    every single request (Phase 5's <200ms budget)."""
    global _non_borrowable_cache
    now = time.monotonic()
    if _non_borrowable_cache is not None and now - _non_borrowable_cache[0] < NON_BORROWABLE_CACHE_TTL_SECONDS:
        return _non_borrowable_cache[1]

    rows = (
        admin.table("books")
        .select("id")
        .in_("collection_type", list(NON_BORROWABLE_COLLECTION_TYPES))
        .execute()
    ).data
    ids = {b["id"] for b in rows}
    _non_borrowable_cache = (now, ids)
    return ids


def _excluded_book_ids(admin: Client, student_id: str, source_book_ids: set[str]) -> set[str]:
    """Plan's exclusion list, applied before ranking. `source_book_ids`
    already covers "ever borrowed" and "active reservation" — every
    active reservation became a source in _collect_sources, so there's
    nothing left to re-derive there; only the catalog-wide
    non-borrowable set needs adding."""
    return set(source_book_ids) | _non_borrowable_book_ids(admin)


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


def get_currently_excluded_book_ids(admin: Client, student_id: str) -> set[str]:
    """Public entry point for Phase 5's live re-exclusion: the endpoint
    re-checks this against last night's stored recommendations at
    request time, so a book borrowed since the job last ran can't slip
    through. Recomputes from current DB state — no caching — since the
    whole point is catching what changed since the job ran."""
    now = datetime.now(timezone.utc)
    sources = _collect_sources(admin, student_id, now)
    return _excluded_book_ids(admin, student_id, set(sources.keys()))


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


def _borrow_counts(admin: Client, since_iso: str, program: str | None = None) -> tuple[dict[str, int], set[str]]:
    """book_id -> borrow count since `since_iso`, plus the set of distinct
    student_ids that contributed — both restricted to `program` when
    given. Aggregated in Python since PostgREST has no GROUP BY, same
    approach _collect_sources already uses for the per-student case."""
    rows = (
        admin.table("loans")
        .select("student_id, book_copies(book_id), profiles(program)")
        .gte("borrowed_at", since_iso)
        .execute()
    ).data

    counts: dict[str, int] = {}
    students: set[str] = set()
    for row in rows:
        if program is not None and (row.get("profiles") or {}).get("program") != program:
            continue
        book_id = (row.get("book_copies") or {}).get("book_id")
        if not book_id:
            continue
        counts[book_id] = counts.get(book_id, 0) + 1
        students.add(row["student_id"])
    return counts, students


def _fallback_recommendations(
    admin: Client, counts: dict[str, int], limit: int, matched_reason: str = POPULAR_REASON
) -> list[Recommendation]:
    """Shared rung-2/3/4 assembly: rank by borrow count desc, top up with
    recently-added books if thin. Used for both the global popular list
    and a single program's list — `counts` and `matched_reason` are the
    only things that differ between the two call sites, so a rung-2 card
    says why it's actually there instead of reusing rung-3's generic
    library-wide copy. No reason_book_id — unlike Phase 3's per-student
    recs, nothing here traces back to one book the student engaged with."""
    excluded = _non_borrowable_book_ids(admin)
    ranked = sorted((bid for bid in counts if bid not in excluded), key=lambda b: (-counts[b], b))

    results = [
        Recommendation(book_id=bid, score=float(counts[bid]), reason_book_id=None, reason=matched_reason)
        for bid in ranked[:limit]
    ]

    if len(results) < limit:
        have = excluded | {r.book_id for r in results}
        # Overfetch generously — some of these will land in `have` and
        # get filtered out, and there's no cheap way to ask Postgres for
        # "N rows not already in this set" through the fluent builder.
        recent = (
            admin.table("books")
            .select("id")
            .order("created_at", desc=True)
            .limit((limit - len(results)) * 4 + 20)
            .execute()
        ).data
        for b in recent:
            if len(results) >= limit:
                break
            if b["id"] in have:
                continue
            results.append(Recommendation(book_id=b["id"], score=0.0, reason_book_id=None, reason=RECENT_REASON))
            have.add(b["id"])

    return results


def get_popular_recommendations(admin: Client, limit: int = DEFAULT_LIMIT) -> list[Recommendation]:
    """Rung 3 (+4 top-up) — library-wide, last 12 months. Backs both a
    logged-in student's fallback (GET /recommendations/me) and the fully
    public GET /recommendations/popular (rung 0, guests)."""
    since = (datetime.now(timezone.utc) - timedelta(days=POPULAR_LOOKBACK_DAYS)).isoformat()
    counts, _students = _borrow_counts(admin, since)
    return _fallback_recommendations(admin, counts, limit)


def get_program_recommendations(admin: Client, program: str, limit: int = DEFAULT_LIMIT) -> list[Recommendation]:
    """Rung 2 — most-borrowed among students in the same program, gated
    by MIN_PROGRAM_STUDENTS so a small program's aggregate can't be
    reverse-engineered back to one or two students' actual history."""
    since = (datetime.now(timezone.utc) - timedelta(days=POPULAR_LOOKBACK_DAYS)).isoformat()
    counts, students = _borrow_counts(admin, since, program=program)
    if len(students) < MIN_PROGRAM_STUDENTS:
        return []
    return _fallback_recommendations(admin, counts, limit, matched_reason=f"Popular among {program} students")
