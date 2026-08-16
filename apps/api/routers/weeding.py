# apps/api/routers/weeding.py
# Reports plan, Phase 2. All endpoints require_librarian — a weeding
# decision (archive/restore/dismiss) is a collection-management action,
# same authorization boundary as routers/patrons.py.

from fastapi import APIRouter, Depends, HTTPException, status

from core.deps import require_librarian
from core.supabase import get_admin_client
from core.weeding import (
    archive_book,
    dismiss_candidate,
    find_weeding_candidates,
    get_weeding_events,
    narrate,
    restore_book,
)
from schemas.auth import UserProfile
from schemas.weeding import WeedingCandidate, WeedingEvent

router = APIRouter(prefix="/weeding", tags=["weeding"])


@router.get("/candidates", response_model=list[WeedingCandidate])
def get_candidates(librarian: UserProfile = Depends(require_librarian)):
    admin = get_admin_client()
    candidates = find_weeding_candidates(admin)
    return [
        WeedingCandidate(
            book_id=c.book_id,
            title=c.title,
            author=c.author,
            category=c.category,
            published_year=c.published_year,
            borrow_count_in_window=c.borrow_count_in_window,
            years_since_added=round(c.years_since_added, 1),
            heuristic_reason=c.heuristic_reason,
            reason=narrate(c),
        )
        for c in candidates
    ]


@router.get("/events", response_model=list[WeedingEvent])
def get_events(limit: int = 50, librarian: UserProfile = Depends(require_librarian)):
    return get_weeding_events(get_admin_client(), limit=limit)


@router.post("/{book_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
def archive(book_id: str, reason: str | None = None, librarian: UserProfile = Depends(require_librarian)):
    admin = get_admin_client()
    book = admin.table("books").select("id").eq("id", book_id).execute().data
    if not book:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Book not found")
    archive_book(admin, book_id, librarian.id, reason=reason)


@router.post("/{book_id}/restore", status_code=status.HTTP_204_NO_CONTENT)
def restore(book_id: str, librarian: UserProfile = Depends(require_librarian)):
    admin = get_admin_client()
    book = admin.table("books").select("id").eq("id", book_id).execute().data
    if not book:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Book not found")
    restore_book(admin, book_id, librarian.id)


@router.post("/{book_id}/dismiss", status_code=status.HTTP_204_NO_CONTENT)
def dismiss(book_id: str, reason: str | None = None, librarian: UserProfile = Depends(require_librarian)):
    admin = get_admin_client()
    book = admin.table("books").select("id").eq("id", book_id).execute().data
    if not book:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Book not found")
    dismiss_candidate(admin, book_id, librarian.id, reason=reason)
