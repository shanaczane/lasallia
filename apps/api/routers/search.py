# apps/api/routers/search.py
# Chatbot Phase 1 — semantic search over the catalog. No LLM, no chat UI
# yet: this is the endpoint the plan wants proven in isolation before
# anything is built on top of it.

from fastapi import APIRouter, Depends, HTTPException, status

from core.deps import get_optional_user, require_librarian
from core.embeddings import embed_text, reembed_books
from core.supabase import get_admin_client
from routers.books import _apply_real_availability, _redact_accession
from schemas.auth import UserProfile
from schemas.search import ReembedResponse, SemanticSearchRequest, SemanticSearchResponse

router = APIRouter(prefix="/search", tags=["search"])


@router.post("/semantic", response_model=SemanticSearchResponse)
def semantic_search(
    body: SemanticSearchRequest,
    user: UserProfile | None = Depends(get_optional_user),
):
    admin = get_admin_client()

    try:
        query_embedding = embed_text(body.query)
    except RuntimeError as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))

    ranked = admin.rpc("hybrid_search_books", {
        "query_embedding": query_embedding,
        "query_text": body.query,
        "match_count": body.limit,
    }).execute().data

    book_ids = [row["book_id"] for row in ranked]
    if not book_ids:
        return SemanticSearchResponse(query=body.query, books=[])

    books_res = admin.table("books").select("*").in_("id", book_ids).execute().data
    by_id = {b["id"]: b for b in books_res}
    # rpc() returns rank order, but a plain .in_() fetch doesn't preserve it.
    ordered = [by_id[bid] for bid in book_ids if bid in by_id]

    copies_res = admin.table("book_copies").select("book_id, status").in_("book_id", book_ids).execute().data
    ordered = _apply_real_availability(ordered, copies_res)
    ordered = _redact_accession(ordered, user)

    return SemanticSearchResponse(query=body.query, books=ordered)


@router.post("/reembed", response_model=ReembedResponse)
def reembed(librarian: UserProfile = Depends(require_librarian)):
    updated = reembed_books(get_admin_client())
    return ReembedResponse(updated=updated)
