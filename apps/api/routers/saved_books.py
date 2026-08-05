from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from core.deps import get_current_user, get_user_supabase
from schemas.auth import UserProfile
from schemas.saved_book import CreateSavedBookRequest, SavedBook

router = APIRouter(prefix="/saved-books", tags=["saved-books"])

# RLS (0013) scopes every route to the caller's own rows — books has a
# public select policy so the books(*) embed works through the same
# RLS-scoped client, unlike book_copies elsewhere in this codebase.

@router.get("", response_model=list[SavedBook])
def list_saved_books(
    user: UserProfile = Depends(get_current_user),
    db: Client = Depends(get_user_supabase),
):
    res = db.table("saved_books").select("*, books(*)").order("created_at", desc=True).execute()
    return res.data

@router.post("", response_model=SavedBook, status_code=status.HTTP_201_CREATED)
def save_book(
    body: CreateSavedBookRequest,
    user: UserProfile = Depends(get_current_user),
    db: Client = Depends(get_user_supabase),
):
    # Idempotent: re-saving an already-saved book returns the existing row
    # instead of erroring on the unique(user_id, book_id) constraint — the
    # frontend toggle shouldn't have to special-case a double-click/race.
    existing = db.table("saved_books").select("*, books(*)").eq("book_id", body.book_id).execute()
    if existing.data:
        return existing.data[0]

    res = db.table("saved_books").insert({"user_id": user.id, "book_id": body.book_id}).execute()
    if not res.data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not save this book")
    saved = res.data[0]
    book_res = db.table("books").select("*").eq("id", body.book_id).execute()
    saved["books"] = book_res.data[0] if book_res.data else None
    return saved

@router.delete("/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
def unsave_book(
    book_id: str,
    user: UserProfile = Depends(get_current_user),
    db: Client = Depends(get_user_supabase),
):
    db.table("saved_books").delete().eq("book_id", book_id).execute()
