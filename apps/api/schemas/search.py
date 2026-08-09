from pydantic import BaseModel

from schemas.book import Book


class SemanticSearchRequest(BaseModel):
    query: str
    limit: int = 20


class SemanticSearchResponse(BaseModel):
    query: str
    books: list[Book]


class ReembedResponse(BaseModel):
    updated: int
