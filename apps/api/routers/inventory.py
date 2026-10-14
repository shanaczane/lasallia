# apps/api/routers/inventory.py
# Inventory module — thin HTTP layer over core/inventory.py. Librarian only.

from fastapi import APIRouter, Depends

from core.deps import require_librarian
from core.inventory import (
    cancel_session,
    complete_session,
    copy_counts,
    flagged_copies,
    get_session_detail,
    list_locations,
    list_sessions,
    resolve_item,
    scan,
    start_session,
)
from core.supabase import get_admin_client
from schemas.auth import UserProfile
from schemas.inventory import (
    FlaggedCopy,
    InventoryCounts,
    InventoryItem,
    InventoryLocation,
    InventorySession,
    InventorySessionDetail,
    ResolveRequest,
    ScanRequest,
    ScanResult,
    StartSessionRequest,
)

router = APIRouter(prefix="/inventory", tags=["inventory"])


@router.get("/locations", response_model=list[InventoryLocation])
def get_locations(librarian: UserProfile = Depends(require_librarian)):
    return list_locations(get_admin_client())


@router.get("/counts", response_model=InventoryCounts)
def get_counts(librarian: UserProfile = Depends(require_librarian)):
    return copy_counts(get_admin_client())


@router.get("/flagged", response_model=list[FlaggedCopy])
def get_flagged(librarian: UserProfile = Depends(require_librarian)):
    return flagged_copies(get_admin_client())


@router.get("/sessions", response_model=list[InventorySession])
def get_sessions(limit: int = 100, librarian: UserProfile = Depends(require_librarian)):
    return list_sessions(get_admin_client(), max(1, min(limit, 500)))


@router.post("/sessions", response_model=InventorySession)
def post_session(body: StartSessionRequest, librarian: UserProfile = Depends(require_librarian)):
    return start_session(get_admin_client(), body.floor, body.aisle or None, librarian.id)


@router.get("/sessions/{session_id}", response_model=InventorySessionDetail)
def get_session(session_id: str, librarian: UserProfile = Depends(require_librarian)):
    return get_session_detail(get_admin_client(), session_id)


@router.post("/sessions/{session_id}/scan", response_model=ScanResult)
def post_scan(session_id: str, body: ScanRequest, librarian: UserProfile = Depends(require_librarian)):
    return scan(get_admin_client(), session_id, body.code, librarian.id)


@router.post("/sessions/{session_id}/complete", response_model=InventorySession)
def post_complete(session_id: str, librarian: UserProfile = Depends(require_librarian)):
    return complete_session(get_admin_client(), session_id, librarian.id)


@router.post("/sessions/{session_id}/cancel", response_model=InventorySession)
def post_cancel(session_id: str, librarian: UserProfile = Depends(require_librarian)):
    return cancel_session(get_admin_client(), session_id)


@router.post("/items/{item_id}/resolve", response_model=InventoryItem)
def post_resolve(item_id: str, body: ResolveRequest, librarian: UserProfile = Depends(require_librarian)):
    return resolve_item(get_admin_client(), item_id, body.action, librarian.id)
