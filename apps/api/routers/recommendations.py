# apps/api/routers/recommendations.py
# Recommendations plan, Phase 5 — serves precomputed recommendations
# (jobs/rebuild_recommendations.py). Nothing here scores anything at
# request time; this just reads last night's stored rows, drops whatever
# the student has borrowed/reserved SINCE that job ran, and trims to
# `limit`. The heavy lifting (TF-IDF, neighbor aggregation) already
# happened offline — see core/recommendations.py.

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from supabase import Client

from core.deps import get_current_user, get_optional_user, get_user_supabase
from core.rate_limit import check_and_record
from core.recommendation_events import log_events
from core.recommendations import get_currently_excluded_book_ids
from core.supabase import get_admin_client
from schemas.auth import UserProfile
from schemas.recommendation import (
    LogEventsRequest,
    RecommendationItem,
    RecommendationsResponse,
)

router = APIRouter(prefix="/recommendations", tags=["recommendations"])

# Plan 0's scope line: student dashboard only. A librarian or guest
# token is a valid *login*, but "For You" is specifically a student
# feature — same distinction the plan draws for account tools not
# existing for guests, just for a different role this time.
DEFAULT_LIMIT = 8
STORED_LIMIT = 20  # matches jobs/rebuild_recommendations.py's STORED_PER_STUDENT

# Phase 9 — a stored rung-1/2 row this old is "stale personalization"
# per the plan's hardening checklist: better to fall through to the
# rung-3/4 floor than serve picks this out of date.
STALE_AFTER_DAYS = 7

# Phase 9 rate limits — Phase 5's own spec for /popular ("kiosks share
# an IP, set the limit generously"); /events gets a tighter one since
# it's a write, not a cached read.
POPULAR_RATE_LIMIT = (120, 60)  # (max_requests, window_seconds)
EVENTS_RATE_LIMIT = (60, 60)
MAX_EVENTS_PER_BATCH = 50


def _is_stale(generated_at_iso: str) -> bool:
    generated_at = datetime.fromisoformat(generated_at_iso)
    return datetime.now(timezone.utc) - generated_at > timedelta(days=STALE_AFTER_DAYS)


@router.get("/me", response_model=RecommendationsResponse)
def get_my_recommendations(
    limit: int = DEFAULT_LIMIT,
    user: UserProfile = Depends(get_current_user),
    db: Client = Depends(get_user_supabase),
):
    # get_current_user already 401s on missing/invalid auth (plan 5's
    # "unauthenticated requests return 401, not an empty list"). A
    # logged-in non-student additionally gets a plain 403 rather than a
    # silently empty section — this endpoint has no meaning for them.
    if user.role != "student":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Recommendations are only available for students")

    limit = max(1, min(limit, STORED_LIMIT))

    # book:books!book_id(*) embeds the recommended book in the same round
    # trip — student_recommendations has two FKs into books (book_id and
    # reason_book_id), so the !book_id hint disambiguates which one. The
    # stored-recs fetch and the live-exclusion check are independent of
    # each other, so they run concurrently rather than one after the
    # other — that, plus the embed above, is what keeps this endpoint
    # inside Phase 5's <200ms budget instead of the ~500ms an
    # unoptimized, fully-sequential version measured at.
    with ThreadPoolExecutor(max_workers=2) as pool:
        stored_future = pool.submit(
            lambda: db.table("student_recommendations")
            .select("rank, score, reason, reason_book_id, generated_at, book:books!book_id(*)")
            .eq("student_id", user.id)
            .order("rank")
            .limit(STORED_LIMIT)
            .execute()
        )
        excluded_future = pool.submit(get_currently_excluded_book_ids, db, user.id)
        stored = stored_future.result().data
        excluded = excluded_future.result()

    # Phase 7: no stored rung-1 recs at all, or live exclusions wiped out
    # every one that was stored — either way, fall through the ladder
    # rather than handing back an empty section. Phase 9: a job that
    # hasn't run in a week is the same problem in slow motion — don't
    # serve week-old "personalization" either.
    live = [row for row in stored if row["book"]["id"] not in excluded][:limit] if stored else []
    if not live or _is_stale(stored[0]["generated_at"]):
        return _fallback_response(get_admin_client(), user.id, limit)

    items = [
        RecommendationItem(
            book=row["book"],
            rank=row["rank"],
            score=row["score"],
            reason=row["reason"],
            reason_book_id=row["reason_book_id"],
        )
        for row in live
    ]

    return RecommendationsResponse(recommendations=items, generated_at=stored[0]["generated_at"], rung="personal")


def _rows_to_response(rows: list[dict], rung: Literal["program", "popular"]) -> RecommendationsResponse:
    items = [
        RecommendationItem(book=r["book"], rank=r["rank"], score=0.0, reason=r["reason"], reason_book_id=None)
        for r in rows
    ]
    return RecommendationsResponse(recommendations=items, generated_at=rows[0]["generated_at"], rung=rung)


def _fallback_response(admin: Client, user_id: str, limit: int) -> RecommendationsResponse:
    """Rung 2 then rung 3/4 (core/recommendations.py's docstrings) — a
    student with no personal recommendations at all, or none left after
    live exclusion, lands here. Public-read tables (migrations/0019), so
    this could use the caller's own RLS-scoped client too, but the
    program lookup just below already needs the admin client (no
    self-select policy on `profiles` — same reason routers/sessions.py's
    _insert_session looks up full_name via the admin client), so the
    whole fallback path stays on one client for consistency."""
    profile_res = admin.table("profiles").select("program").eq("id", user_id).execute()
    program = profile_res.data[0]["program"] if profile_res.data else None

    if program:
        rows = (
            admin.table("program_recommendations")
            .select("rank, reason, generated_at, book:books!book_id(*)")
            .eq("program", program)
            .order("rank")
            .limit(limit)
            .execute()
        ).data
        if rows and not _is_stale(rows[0]["generated_at"]):
            return _rows_to_response(rows, rung="program")

    rows = (
        admin.table("popular_recommendations")
        .select("rank, reason, generated_at, book:books!book_id(*)")
        .order("rank")
        .limit(limit)
        .execute()
    ).data
    if rows:
        return _rows_to_response(rows, rung="popular")

    return RecommendationsResponse(recommendations=[], generated_at=None, rung="popular")


@router.get("/popular", response_model=RecommendationsResponse)
def get_popular_recommendations_endpoint(request: Request, response: Response, limit: int = DEFAULT_LIMIT):
    """Rung 0 — fully public, no auth dependency of any kind. This is
    what makes "a guest never reaches rung 1 or 2" true by construction:
    there is no code path from this handler into student_recommendations
    or program_recommendations at all. Byte-identical for every caller —
    reads the same precomputed rows jobs/rebuild_recommendations.py
    already wrote for GET /recommendations/me's own rung-3/4 fallback."""
    # Keyed by IP, not session — this is the one endpoint in the plan
    # explicitly public with no identity to key off. A kiosk's several
    # students share an IP, hence the generous limit.
    if not check_and_record(f"popular:{request.client.host}", *POPULAR_RATE_LIMIT):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests — try again shortly")

    limit = max(1, min(limit, STORED_LIMIT))
    admin = get_admin_client()
    rows = (
        admin.table("popular_recommendations")
        .select("rank, reason, generated_at, book:books!book_id(*)")
        .order("rank")
        .limit(limit)
        .execute()
    ).data
    response.headers["Cache-Control"] = "public, max-age=3600"
    if not rows:
        return RecommendationsResponse(recommendations=[], generated_at=None, rung="popular")
    return _rows_to_response(rows, rung="popular")


@router.post("/events", status_code=status.HTTP_204_NO_CONTENT)
def log_recommendation_events(
    body: LogEventsRequest,
    user: UserProfile | None = Depends(get_optional_user),
):
    """Phase 9 — click-through logging. student_id/is_guest come from
    the session, never the request body (same rule as every other tool/
    endpoint in this app that could otherwise be pointed at someone
    else's identity). A guest must supply their own opaque session_id —
    there's no account to key a rate limit or funnel off otherwise."""
    if len(body.events) > MAX_EVENTS_PER_BATCH:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Too many events in one batch (max {MAX_EVENTS_PER_BATCH})")

    if user:
        rate_key = f"events:{user.id}"
    elif body.session_id:
        rate_key = f"events:{body.session_id}"
    else:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "session_id is required when not signed in")

    if not check_and_record(rate_key, *EVENTS_RATE_LIMIT):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests — try again shortly")

    rows = [
        {
            "student_id": user.id if user else None,
            "session_id": None if user else body.session_id,
            "is_guest": user is None,
            "book_id": e.book_id,
            "event_type": e.event_type,
            "rank": e.rank,
        }
        for e in body.events
    ]
    log_events(get_admin_client(), rows)
