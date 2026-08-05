from pydantic import BaseModel

from schemas.book import Book

class SavedBook(BaseModel):
    id: str
    user_id: str
    book_id: str
    created_at: str
    books: Book | None = None

class CreateSavedBookRequest(BaseModel):
    book_id: str
