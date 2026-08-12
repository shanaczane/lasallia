# apps/api/routers/recommendations.py
# Recommendations plan, Phase 5 — serves precomputed recommendations
# (jobs/rebuild_recommendations.py). Nothing here scores anything at
# request time; this just reads last night's stored rows, drops whatever
# the student has borrowed/reserved SINCE that job ran, and trims to
# `limit`. The heavy lifting (TF-IDF, neighbor aggregation) already
# happened offline — see core/recommendations.py.

from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from core.deps import get_current_user, get_user_supabase
from core.recommendations import get_currently_excluded_book_ids
from schemas.auth import UserProfile
from schemas.recommendation import RecommendationItem, RecommendationsResponse

router = APIRouter(prefix="/recommendations", tags=["recommendations"])

# Plan 0's scope line: student dashboard only. A librarian or guest
# token is a valid *login*, but "For You" is specifically a student
# feature — same distinction the plan draws for account tools not
# existing for guests, just for a different role this time.
DEFAULT_LIMIT = 8
STORED_LIMIT = 20  # matches jobs/rebuild_recommendations.py's STORED_PER_STUDENT


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

    if not stored:
        return RecommendationsResponse(recommendations=[], generated_at=None)

    live = [row for row in stored if row["book"]["id"] not in excluded][:limit]
    if not live:
        return RecommendationsResponse(recommendations=[], generated_at=stored[0]["generated_at"])

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

    return RecommendationsResponse(recommendations=items, generated_at=stored[0]["generated_at"])
