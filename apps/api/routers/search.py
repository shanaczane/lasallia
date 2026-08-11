# apps/api/routers/search.py
# Chatbot Phase 1 — semantic search over the catalog. No LLM, no chat UI
# yet: this is the endpoint the plan wants proven in isolation before
# anything is built on top of it.

from fastapi import APIRouter, Depends, HTTPException, status

from core.deps import get_optional_user, require_librarian
from core.embeddings import reembed_books, semantic_search as run_semantic_search
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
        ordered = run_semantic_search(admin, body.query, body.limit)
    except RuntimeError as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e))

    if not ordered:
        return SemanticSearchResponse(query=body.query, books=[])

    book_ids = [b["id"] for b in ordered]
    copies_res = admin.table("book_copies").select("book_id, status").in_("book_id", book_ids).execute().data
    ordered = _apply_real_availability(ordered, copies_res)
    ordered = _redact_accession(ordered, user)

    return SemanticSearchResponse(query=body.query, books=ordered)


@router.post("/reembed", response_model=ReembedResponse)
def reembed(librarian: UserProfile = Depends(require_librarian)):
    updated = reembed_books(get_admin_client())
    return ReembedResponse(updated=updated)
