from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from core.deps import get_current_user, get_user_supabase
from core.reservations import maybe_sweep_expired_reservations
from core.supabase import get_admin_client
from schemas.auth import UserProfile
from schemas.notification import Notification

router = APIRouter(prefix="/notifications", tags=["notifications"])

# RLS (0001) scopes both routes automatically: notifications_select_own /
# notifications_update_own restrict every caller to user_id = auth.uid(),
# librarian included — there's no "see everyone's notifications" case here,
# unlike loans/reservations.

@router.get("", response_model=list[Notification])
def list_notifications(
    user: UserProfile = Depends(get_current_user),
    db: Client = Depends(get_user_supabase),
):
    # So a "your reservation has expired" notice is already here when the
    # student opens the bell, not only after someone loads the catalog.
    maybe_sweep_expired_reservations(get_admin_client())
    res = db.table("notifications").select("*").order("created_at", desc=True).limit(50).execute()
    return res.data

@router.patch("/{notification_id}", response_model=Notification)
def mark_read(
    notification_id: str,
    user: UserProfile = Depends(get_current_user),
    db: Client = Depends(get_user_supabase),
):
    res = db.table("notifications").update({"is_read": True}).eq("id", notification_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    return res.data[0]

@router.post("/mark-all-read", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(
    user: UserProfile = Depends(get_current_user),
    db: Client = Depends(get_user_supabase),
):
    db.table("notifications").update({"is_read": True}).eq("is_read", False).execute()
