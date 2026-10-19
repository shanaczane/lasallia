# Serves recommendations computed by the nightly job, minus anything the
# student borrowed or reserved since it ran. No scoring happens here.

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from supabase import Client

from core.deps import get_current_user, get_optional_user, get_user_supabase, kiosk_session_user
from core.rate_limit import check_and_record
from core.recommendation_events import log_events
from core.recommendations import get_currently_excluded_book_ids
from core.supabase import get_admin_client
from routers.books import _apply_real_availability, _redact_for_patrons
from schemas.auth import UserProfile
from schemas.recommendation import (
    LogEventsRequest,
    RecommendationItem,
    RecommendationsResponse,
)

router = APIRouter(prefix="/recommendations", tags=["recommendations"])

# "For You" is for students and faculty only.
DEFAULT_LIMIT = 8
STORED_LIMIT = 20  # must match STORED_PER_STUDENT in jobs/rebuild_recommendations.py

# Personal picks older than this are skipped in favor of the popular list.
STALE_AFTER_DAYS = 7

# /popular is generous because kiosks share an IP; /events is a write,
# so it's tighter.
POPULAR_RATE_LIMIT = (120, 60)  # (max_requests, window_seconds)
EVENTS_RATE_LIMIT = (60, 60)
KIOSK_RATE_LIMIT = (60, 60)  # per station session
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
    # Other roles get a 403, not an empty list.
    if user.role not in ("student", "faculty"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Recommendations are only available for students and faculty")

    return _recommend_for(db, user.id, max(1, min(limit, STORED_LIMIT)))


def _with_live_availability(rows: list[dict]) -> list[dict]:
    """Recomputes availability from the copies (the stored status is out
    of date) and hides accession numbers, like the catalog."""
    books = [r["book"] for r in rows if r.get("book")]
    if not books:
        return rows
    copies = (
        get_admin_client().table("book_copies")
        .select("book_id, status")
        .in_("book_id", list({b["id"] for b in books}))
        .execute()
    ).data
    _apply_real_availability(books, copies)
    _redact_for_patrons(books, None)
    return rows


def _recommend_for(db: Client, user_id: str, limit: int) -> RecommendationsResponse:
    """Recommendations for one student, with fallbacks. db is the user's
    client for GET /me, or the admin client for the kiosk."""
    # Fetch the stored picks and the exclusions in parallel, for speed.
    # !book_id picks which of the two links to books to embed.
    with ThreadPoolExecutor(max_workers=2) as pool:
        stored_future = pool.submit(
            lambda: db.table("student_recommendations")
            .select("rank, score, reason, reason_book_id, generated_at, book:books!book_id(*)")
            .eq("student_id", user_id)
            .order("rank")
            .limit(STORED_LIMIT)
            .execute()
        )
        # Admin client: students can't read book_copies, so their own client
        # would miss borrowed books. Only book ids come back.
        excluded_future = pool.submit(get_currently_excluded_book_ids, get_admin_client(), user_id)
        stored = stored_future.result().data
        excluded = excluded_future.result()

    # No personal picks left, or they're over a week old: use the fallbacks.
    live = _without_excluded(stored, excluded, limit) if stored else []
    if not live or _is_stale(stored[0]["generated_at"]):
        return _fallback_response(get_admin_client(), user_id, limit, excluded)

    _with_live_availability(live)
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
    _with_live_availability(rows)
    items = [
        RecommendationItem(book=r["book"], rank=r["rank"], score=0.0, reason=r["reason"], reason_book_id=None)
        for r in rows
    ]
    return RecommendationsResponse(recommendations=items, generated_at=rows[0]["generated_at"], rung=rung)


def _without_excluded(rows: list[dict], excluded: set[str], limit: int) -> list[dict]:
    return [r for r in rows if r["book"]["id"] not in excluded][:limit]


def _fallback_response(admin: Client, user_id: str, limit: int, excluded: set[str]) -> RecommendationsResponse:
    """Program list, then popular list, for a student with no personal
    picks. These lists are shared, so the student's own books are filtered
    out (fetching extra so the section still fills up)."""
    fetch = limit + len(excluded)
    profile_res = admin.table("profiles").select("program").eq("id", user_id).execute()
    program = profile_res.data[0]["program"] if profile_res.data else None

    if program:
        rows = (
            admin.table("program_recommendations")
            .select("rank, reason, generated_at, book:books!book_id(*)")
            .eq("program", program)
            .order("rank")
            .limit(fetch)
            .execute()
        ).data
        rows = _without_excluded(rows, excluded, limit) if rows and not _is_stale(rows[0]["generated_at"]) else []
        if rows:
            return _rows_to_response(rows, rung="program")

    rows = (
        admin.table("popular_recommendations")
        .select("rank, reason, generated_at, book:books!book_id(*)")
        .order("rank")
        .limit(fetch)
        .execute()
    ).data
    rows = _without_excluded(rows, excluded, limit)
    if rows:
        return _rows_to_response(rows, rung="popular")

    return RecommendationsResponse(recommendations=[], generated_at=None, rung="popular")


@router.get("/popular", response_model=RecommendationsResponse)
def get_popular_recommendations_endpoint(request: Request, response: Response, limit: int = DEFAULT_LIMIT):
    """Public popular list. It never reads anyone's personal data, so
    guests can't reach it."""
    # Limited by IP (there's no login). Kiosks share an IP, hence the high limit.
    if not check_and_record(f"popular:{request.client.host}", *POPULAR_RATE_LIMIT):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests — try again shortly")

    response.headers["Cache-Control"] = "public, max-age=3600"
    return _popular_response(get_admin_client(), max(1, min(limit, STORED_LIMIT)))


def _popular_response(admin: Client, limit: int) -> RecommendationsResponse:
    rows = (
        admin.table("popular_recommendations")
        .select("rank, reason, generated_at, book:books!book_id(*)")
        .order("rank")
        .limit(limit)
        .execute()
    ).data
    if not rows:
        return RecommendationsResponse(recommendations=[], generated_at=None, rung="popular")
    return _rows_to_response(rows, rung="popular")


# The kiosk's "For you" tab. A tapped-in student gets their own picks;
# guests and ended sessions get the public popular list.
@router.get("/kiosk", response_model=RecommendationsResponse)
def get_kiosk_recommendations(request: Request, session_id: str | None = None, limit: int = DEFAULT_LIMIT):
    limit = max(1, min(limit, STORED_LIMIT))
    admin = get_admin_client()
    student = kiosk_session_user(admin, session_id)

    if student is None:
        if not check_and_record(f"popular:{request.client.host}", *POPULAR_RATE_LIMIT):
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests — try again shortly")
        return _popular_response(admin, limit)

    if not check_and_record(f"kiosk-recs:{session_id}", *KIOSK_RATE_LIMIT):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests — try again shortly")
    return _recommend_for(admin, student.id, limit)


@router.post("/events", status_code=status.HTTP_204_NO_CONTENT)
def log_recommendation_events(
    body: LogEventsRequest,
    user: UserProfile | None = Depends(get_optional_user),
):
    """Logs impressions and clicks. Who the user is comes from their login,
    never the request body. Guests must send a session_id."""
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
