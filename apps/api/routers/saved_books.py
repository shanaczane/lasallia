from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from core.deps import get_current_user, get_user_supabase
from core.supabase import get_admin_client
from routers.books import _apply_real_availability, _redact_for_patrons
from schemas.auth import UserProfile
from schemas.saved_book import CreateSavedBookRequest, SavedBook

router = APIRouter(prefix="/saved-books", tags=["saved-books"])


def _with_live_books(rows: list[dict], user: UserProfile) -> list[dict]:
    """Recomputes each book's availability from its copies (the stored
    status is out of date) and hides accession numbers, like the catalog.
    Copies are read with the admin client because they have no public RLS."""
    books = [r["books"] for r in rows if r.get("books")]
    if not books:
        return rows
    copies = (
        get_admin_client().table("book_copies").select("book_id, status")
        .in_("book_id", [b["id"] for b in books]).execute().data
    )
    _apply_real_availability(books, copies)
    _redact_for_patrons(books, user)
    return rows

# RLS limits every route to the caller's own saved books.

@router.get("", response_model=list[SavedBook])
def list_saved_books(
    user: UserProfile = Depends(get_current_user),
    db: Client = Depends(get_user_supabase),
):
    res = db.table("saved_books").select("*, books(*)").order("created_at", desc=True).execute()
    return _with_live_books(res.data, user)

@router.post("", response_model=SavedBook, status_code=status.HTTP_201_CREATED)
def save_book(
    body: CreateSavedBookRequest,
    user: UserProfile = Depends(get_current_user),
    db: Client = Depends(get_user_supabase),
):
    # Saving an already-saved book returns the existing row, not an error.
    existing = db.table("saved_books").select("*, books(*)").eq("book_id", body.book_id).execute()
    if existing.data:
        return _with_live_books(existing.data, user)[0]

    res = db.table("saved_books").insert({"user_id": user.id, "book_id": body.book_id}).execute()
    if not res.data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not save this book")
    saved = res.data[0]
    book_res = db.table("books").select("*").eq("id", body.book_id).execute()
    saved["books"] = book_res.data[0] if book_res.data else None
    return _with_live_books([saved], user)[0]

@router.delete("/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
def unsave_book(
    book_id: str,
    user: UserProfile = Depends(get_current_user),
    db: Client = Depends(get_user_supabase),
):
    db.table("saved_books").delete().eq("book_id", book_id).execute()
