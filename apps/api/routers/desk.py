# The desk's ID tap: tap a borrower's ID to see their open loans, unpaid
# fines and books ready to pick up. Librarians only.

from fastapi import APIRouter, Depends

from core.deps import require_librarian
from core.desk import open_loans, ready_pickups, tap_required, tapped_user_id, unpaid_fine_loans
from core.settings import get_library_settings
from core.supabase import get_admin_client
from schemas.auth import UserProfile
from schemas.desk import DeskPatron, IdentifyRequest

router = APIRouter(prefix="/desk", tags=["desk"])


# POST, so the card's id stays out of URLs and logs.
@router.post("/identify", response_model=DeskPatron)
def identify(body: IdentifyRequest, librarian: UserProfile = Depends(require_librarian)):
    db = get_admin_client()
    user_id = tapped_user_id(db, body.rfid_uid)
    profile = (
        db.table("profiles").select("id, full_name, avatar_url, role, program, college, year_level")
        .eq("id", user_id).execute()
    ).data[0]
    return DeskPatron(
        **profile,
        open_loans=open_loans(db, user_id),
        unpaid_fines=unpaid_fine_loans(db, user_id),
        ready_pickups=ready_pickups(db, user_id),
        require_id_tap=tap_required(get_library_settings(db)),
    )
