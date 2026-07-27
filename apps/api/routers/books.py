from fastapi import APIRouter, HTTPException, status

from core.supabase import get_client
from schemas.book import Book, BookSearchResponse

router = APIRouter(prefix="/books", tags=["books"])

# Only 185 rows today (Sprint 6.3 scale) — one full fetch, client-side
# search/filter/sort. Revisit with real pagination once the catalog grows
# past what's reasonable to ship in one response.
DEFAULT_LIMIT = 1000

@router.get("", response_model=BookSearchResponse)
def list_books(limit: int = DEFAULT_LIMIT):
    res = get_client().table("books").select("*").order("title").limit(limit).execute()
    return BookSearchResponse(books=res.data, total=len(res.data), page=1, per_page=limit)

@router.get("/{book_id}", response_model=Book)
def get_book(book_id: str):
    res = get_client().table("books").select("*").eq("id", book_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Book not found")
    return res.data[0]
