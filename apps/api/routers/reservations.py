from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from core.deps import get_current_user, get_user_supabase
from schemas.auth import UserProfile
from schemas.reservation import CreateReservationRequest, Reservation, UpdateReservationRequest

router = APIRouter(prefix="/reservations", tags=["reservations"])

PICKUP_WINDOW_DAYS = 3

@router.get("", response_model=list[Reservation])
def list_reservations(
    user: UserProfile = Depends(get_current_user),
    db: Client = Depends(get_user_supabase),
):
    # RLS scopes this automatically: students see only their own rows,
    # librarians see every reservation. No role branching needed here.
    res = db.table("reservations").select("*, books(*), profiles(*)").order("requested_at", desc=True).execute()
    return res.data

@router.post("", response_model=Reservation, status_code=status.HTTP_201_CREATED)
def create_reservation(
    body: CreateReservationRequest,
    user: UserProfile = Depends(get_current_user),
    db: Client = Depends(get_user_supabase),
):
    res = db.table("reservations").insert({
        "user_id": user.id,
        "book_id": body.book_id,
        "status": "pending",
    }).execute()
    if not res.data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not create reservation")
    return res.data[0]

@router.patch("/{reservation_id}", response_model=Reservation)
def update_reservation(
    reservation_id: str,
    body: UpdateReservationRequest,
    user: UserProfile = Depends(get_current_user),
    db: Client = Depends(get_user_supabase),
):
    # Students may only cancel their own reservation — moving it to
    # confirmed/ready is a librarian-only action. RLS already restricts
    # *whose* row can be touched; this restricts *what* a non-librarian
    # is allowed to set it to.
    if user.role != "librarian" and body.status != "cancelled":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a librarian can confirm or mark a reservation ready")

    patch: dict = {"status": body.status}
    now = datetime.now(timezone.utc).isoformat()
    if body.status == "cancelled":
        patch["cancelled_at"] = now
    elif body.status == "confirmed":
        patch["confirmed_at"] = now
        patch["pickup_by"] = (datetime.now(timezone.utc) + timedelta(days=PICKUP_WINDOW_DAYS)).isoformat()

    res = db.table("reservations").update(patch).eq("id", reservation_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reservation not found")
    return res.data[0]
