# Book recommendations for a student, based on books similar to what they
# borrowed or reserved. Each pick is tied to the book that caused it (no
# averaging), so a student who reads poetry and networking gets both.
#
# "Students who read this also borrowed" data can boost a pick but never
# adds one. That table is empty until enough students borrow.

import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from supabase import Client

from core.cooccurrence import LIFT_CEILING
from core.paging import fetch_all_rows, fetch_rows_for_ids

# How much each kind of history counts. Fulfilled reservations already
# count as loans; expired and cancelled ones don't count.
LOAN_WEIGHTS = {"returned": 1.0, "active": 1.0, "overdue": 1.0}
ACTIVE_RESERVATION_STATUSES = {"pending", "ready"}
RESERVATION_WEIGHT = 0.7

RECENCY_HALF_LIFE_DAYS = 180
DIVERSITY_CAP_PER_CATEGORY = 3
DEFAULT_LIMIT = 10

# Strength of the "students also borrowed" boost. Note it in the thesis
# if changed.
COOCCURRENCE_ALPHA = 0.3

# Small boost (15%) for picks that match the student's program. Like the
# boost above, it only reorders picks; it never adds one.
PROGRAM_ALPHA = 0.15

# Fallbacks for students with no history: program favorites, popular
# books, then recently added.
POPULAR_LOOKBACK_DAYS = 365
POPULAR_REASON = "Popular at the LRC"
RECENT_REASON = "Recently added"
# Privacy: a program's "most borrowed" list needs at least 3 students, or
# it could reveal one person's borrowing.
MIN_PROGRAM_STUDENTS = 3

# Library-use-only collections; never recommended since they can't be borrowed.
NON_BORROWABLE_COLLECTION_TYPES = {"Reference", "Thesis", "Capstone", "MTR", "Archives"}

# Other books only count toward "and 2 others" in the reason if they
# contributed at least 70% as much as the top one.
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
    # The parts of the weight, for scripts/explain_recommendations.py.
    kind: str = ""  # e.g. "Loan (returned)"
    base_weight: float = 0.0
    days_since: float = 0.0
    decay: float = 0.0


@dataclass
class ScoredPick:
    """One recommendation and how its score was reached."""
    book_id: str
    score: float
    reason_book_id: str | None
    reason: str
    content_score: float
    similarities: dict[str, float]   # source book id -> similarity
    contributions: dict[str, float]  # source book id -> similarity × source weight
    lift: float | None
    normalized_boost: float
    lift_multiplier: float
    program_multiplier: float


@dataclass
class StudentScoring:
    """Everything score_student worked out, picks in final rank order."""
    computed_at: datetime
    sources: dict[str, _Source]
    picks: list[ScoredPick]
    candidate_count: int
    titles: dict[str, str]
    categories: dict[str, str | None]


def _days_since(anchor_iso: str, now: datetime) -> float:
    anchor = datetime.fromisoformat(anchor_iso)
    return max((now - anchor).total_seconds() / 86400, 0)


def _recency_decay(anchor_iso: str, now: datetime) -> float:
    return 0.5 ** (_days_since(anchor_iso, now) / RECENCY_HALF_LIFE_DAYS)


def _collect_sources(admin: Client, student_id: str, now: datetime) -> dict[str, _Source]:
    """One entry per book the student borrowed or reserved. If a book shows
    up more than once, only its strongest event counts."""
    sources: dict[str, _Source] = {}

    def consider(book_id: str, base_weight: float, anchor_iso: str, verb: str, kind: str) -> None:
        decay = _recency_decay(anchor_iso, now)
        weight = base_weight * decay
        existing = sources.get(book_id)
        if existing is None or weight > existing.weight:
            sources[book_id] = _Source(
                book_id=book_id, weight=weight, verb=verb, kind=kind,
                base_weight=base_weight, days_since=_days_since(anchor_iso, now), decay=decay,
            )

    # Runs on live requests too, so fetch loans and reservations in parallel.
    with ThreadPoolExecutor(max_workers=2) as pool:
        loans_future = pool.submit(fetch_all_rows, lambda: (
            admin.table("loans")
            .select("status, borrowed_at, book_copies(book_id)")
            .eq("student_id", student_id)
            .order("id")
        ))
        reservations_future = pool.submit(fetch_all_rows, lambda: (
            admin.table("reservations")
            .select("book_id, status, requested_at")
            .eq("user_id", student_id)
            .order("id")
        ))
        loans = loans_future.result()
        reservations = reservations_future.result()

    for l in loans:
        base_weight = LOAN_WEIGHTS.get(l["status"])
        copy = l.get("book_copies")
        book_id = copy.get("book_id") if copy else None
        if base_weight is None or book_id is None:
            continue
        consider(book_id, base_weight, l["borrowed_at"], "borrowed", f"Loan ({l['status']})")

    for r in reservations:
        if r["status"] not in ACTIVE_RESERVATION_STATUSES:
            continue
        consider(r["book_id"], RESERVATION_WEIGHT, r["requested_at"], "reserved", f"Reservation ({r['status']})")

    return sources


_non_borrowable_cache: tuple[float, set[str]] | None = None
NON_BORROWABLE_CACHE_TTL_SECONDS = 300


def _non_borrowable_book_ids(admin: Client) -> set[str]:
    """Ids of non-borrowable books, cached for 5 minutes since they rarely
    change."""
    global _non_borrowable_cache
    now = time.monotonic()
    if _non_borrowable_cache is not None and now - _non_borrowable_cache[0] < NON_BORROWABLE_CACHE_TTL_SECONDS:
        return _non_borrowable_cache[1]

    rows = fetch_all_rows(lambda: (
        admin.table("books")
        .select("id")
        .in_("collection_type", list(NON_BORROWABLE_COLLECTION_TYPES))
        .order("id")
    ))
    ids = {b["id"] for b in rows}
    _non_borrowable_cache = (now, ids)
    return ids


def _excluded_book_ids(admin: Client, student_id: str, source_book_ids: set[str]) -> set[str]:
    """Books never to recommend: ones the student already borrowed or
    reserved, and non-borrowable ones."""
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
    """Books to hide from the stored recommendations right now, so a book
    borrowed since the nightly job doesn't show up. Never cached."""
    now = datetime.now(timezone.utc)
    sources = _collect_sources(admin, student_id, now)
    return _excluded_book_ids(admin, student_id, set(sources.keys()))


def get_recommendations_for_student(admin: Client, student_id: str, limit: int = DEFAULT_LIMIT) -> list[Recommendation]:
    return [
        Recommendation(book_id=p.book_id, score=p.score, reason_book_id=p.reason_book_id, reason=p.reason)
        for p in score_student(admin, student_id, limit).picks
    ]


def score_student(admin: Client, student_id: str, limit: int = DEFAULT_LIMIT) -> StudentScoring:
    """The whole calculation for one student. Used by the nightly job and by
    scripts/explain_recommendations.py, so the two always agree."""
    now = datetime.now(timezone.utc)
    sources = _collect_sources(admin, student_id, now)
    titles: dict[str, str] = {}
    categories: dict[str, str | None] = {}

    def result(picks: list[ScoredPick], candidate_count: int = 0) -> StudentScoring:
        return StudentScoring(now, sources, picks, candidate_count, titles, categories)

    if not sources:
        return result([])

    # For the program boost. Only runs in the nightly job, so the extra
    # query is fine.
    profile_res = admin.table("profiles").select("program").eq("id", student_id).execute()
    student_program = profile_res.data[0]["program"] if profile_res.data else None

    source_ids = list(sources.keys())
    neighbor_rows = fetch_rows_for_ids(lambda ids: (
        admin.table("book_similarities")
        .select("book_id, neighbor_book_id, score")
        .in_("book_id", ids)
        .order("book_id")
        .order("rank")
    ), source_ids)

    # candidate_book_id -> { source_book_id -> contribution }
    contributions: dict[str, dict[str, float]] = {}
    similarities: dict[str, dict[str, float]] = {}
    for row in neighbor_rows:
        source = sources.get(row["book_id"])
        if source is None:
            continue
        contribution = row["score"] * source.weight
        candidate_id = row["neighbor_book_id"]
        contributions.setdefault(candidate_id, {})[row["book_id"]] = contribution
        similarities.setdefault(candidate_id, {})[row["book_id"]] = row["score"]

    excluded = _excluded_book_ids(admin, student_id, set(source_ids))
    candidate_ids = [cid for cid in contributions if cid not in excluded]
    if not candidate_ids:
        books = fetch_rows_for_ids(lambda ids: (
            admin.table("books").select("id, title, category").in_("id", ids).order("id")
        ), source_ids)
        titles.update({b["id"]: b["title"] for b in books})
        return result([])

    # "Students also borrowed" data. Usually empty for now, so no boost.
    cooc_rows = fetch_rows_for_ids(lambda ids: (
        admin.table("book_cooccurrence")
        .select("book_id, neighbor_book_id, lift")
        .in_("book_id", ids)
        .order("book_id")
        .order("neighbor_book_id")
    ), source_ids)
    cooc_lookup = {(r["book_id"], r["neighbor_book_id"]): r["lift"] for r in cooc_rows}

    needed_book_ids = set(candidate_ids) | set(source_ids)
    books = fetch_rows_for_ids(lambda ids: (
        admin.table("books").select("id, title, category").in_("id", ids).order("id")
    ), needed_book_ids)
    titles.update({b["id"]: b["title"] for b in books})
    categories.update({b["id"]: b.get("category") for b in books})
    verbs = {sid: s.verb for sid, s in sources.items()}

    scored: list[ScoredPick] = []
    for candidate_id in candidate_ids:
        cand_contributions = contributions[candidate_id]
        content_score = sum(cand_contributions.values())
        reason, reason_book_id = _build_reason(cand_contributions, titles, verbs)

        # Boost uses the same book the reason names, so the two agree.
        lift = cooc_lookup.get((reason_book_id, candidate_id))
        normalized_boost = 0.0
        lift_multiplier = 1.0
        if lift is not None:
            # Lift 1.0 means no link; below 1 gives no boost (never a penalty).
            normalized_boost = max(0.0, min((lift - 1) / (LIFT_CEILING - 1), 1.0))
            lift_multiplier = 1 + COOCCURRENCE_ALPHA * normalized_boost
            score = content_score * lift_multiplier
            reason = f"{reason} · popular with students who read it"
        else:
            score = content_score

        # Stacks with the boost above.
        program_multiplier = 1.0
        if student_program and categories.get(candidate_id) == student_program:
            program_multiplier = 1 + PROGRAM_ALPHA
            score *= program_multiplier
            reason = f"{reason} · matches your program"

        scored.append(ScoredPick(
            book_id=candidate_id, score=score, reason_book_id=reason_book_id, reason=reason,
            content_score=content_score, similarities=similarities[candidate_id], contributions=cand_contributions,
            lift=lift, normalized_boost=normalized_boost, lift_multiplier=lift_multiplier,
            program_multiplier=program_multiplier,
        ))

    # Highest score first; book_id breaks ties so the order is stable.
    scored.sort(key=lambda p: (-p.score, p.book_id))

    # At most 3 picks per category, for variety. Uses `category` because
    # `subject` is mostly empty.
    picks: list[ScoredPick] = []
    category_counts: dict[str | None, int] = {}
    for pick in scored:
        if len(picks) >= limit:
            break
        category = categories.get(pick.book_id)
        if category_counts.get(category, 0) >= DIVERSITY_CAP_PER_CATEGORY:
            continue
        category_counts[category] = category_counts.get(category, 0) + 1
        picks.append(pick)

    return result(picks, len(scored))


def _borrow_counts(admin: Client, since_iso: str, program: str | None = None) -> tuple[dict[str, int], set[str]]:
    """Borrow count per book since `since_iso`, and which students borrowed,
    optionally for one program only. Counted in Python (no GROUP BY in
    PostgREST)."""
    # loans has two links to profiles, so name the borrower one.
    rows = fetch_all_rows(lambda: (
        admin.table("loans")
        .select("student_id, book_copies(book_id), profiles!loans_student_id_fkey(program)")
        .gte("borrowed_at", since_iso)
        .order("id")
    ))

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
    """Most-borrowed books first, topped up with recently added ones if
    there aren't enough. Used for both the popular and program lists."""
    excluded = _non_borrowable_book_ids(admin)
    ranked = sorted((bid for bid in counts if bid not in excluded), key=lambda b: (-counts[b], b))

    results = [
        Recommendation(book_id=bid, score=float(counts[bid]), reason_book_id=None, reason=matched_reason)
        for bid in ranked[:limit]
    ]

    if len(results) < limit:
        have = excluded | {r.book_id for r in results}
        # Fetch extra, since some are filtered out below.
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
    """Most borrowed in the last year, library-wide. Also what guests see."""
    since = (datetime.now(timezone.utc) - timedelta(days=POPULAR_LOOKBACK_DAYS)).isoformat()
    counts, _students = _borrow_counts(admin, since)
    return _fallback_recommendations(admin, counts, limit)


def get_program_recommendations(admin: Client, program: str, limit: int = DEFAULT_LIMIT) -> list[Recommendation]:
    """Most borrowed by students in this program (needs at least 3 students,
    for privacy). Tops up with books tagged for the program, so new
    programs still get relevant picks."""
    since = (datetime.now(timezone.utc) - timedelta(days=POPULAR_LOOKBACK_DAYS)).isoformat()
    counts, students = _borrow_counts(admin, since, program=program)
    results = (
        _fallback_recommendations(admin, counts, limit, matched_reason=f"Popular among {program} students")
        if len(students) >= MIN_PROGRAM_STUDENTS
        else []
    )
    if len(results) >= limit:
        return results

    excluded = _non_borrowable_book_ids(admin) | {r.book_id for r in results}
    # Fetch extra, since some are filtered out below.
    catalog_rows = (
        admin.table("books")
        .select("id")
        .eq("category", program)
        .is_("archived_at", "null")
        .order("created_at", desc=True)
        .limit((limit - len(results)) * 4 + 20)
        .execute()
    ).data
    for b in catalog_rows:
        if len(results) >= limit:
            break
        if b["id"] in excluded:
            continue
        results.append(Recommendation(book_id=b["id"], score=0.0, reason_book_id=None, reason=f"For {program} students"))
        excluded.add(b["id"])

    return results
