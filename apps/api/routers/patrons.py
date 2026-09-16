from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from core.deps import get_user_supabase, require_librarian
from core.supabase import get_admin_client
from schemas.auth import UserProfile
from schemas.patron import Patron, UpdatePatronRequest

router = APIRouter(prefix="/users", tags=["patrons"])

MAX_YEAR_LEVEL = 8  # generous ceiling — covers every real program length (4-6 yrs) with room to spare

# Librarian-only management view over every registered account (build plan
# 5.5). profiles_select_librarian (0008) is a role check, not a row check —
# is_librarian() doesn't reference the row at all — so it grants a
# librarian's own JWT a real bulk SELECT over every profile, not just their
# own. RLS-scoped client is enough here; require_librarian is what actually
# keeps a student from reaching this endpoint at all.

@router.get("", response_model=list[Patron])
def list_patrons(
    librarian: UserProfile = Depends(require_librarian),
    db: Client = Depends(get_user_supabase),
):
    res = db.table("profiles").select("*").order("full_name").execute()
    return res.data

@router.patch("/{user_id}", response_model=Patron)
def update_patron(
    user_id: str,
    body: UpdatePatronRequest,
    librarian: UserProfile = Depends(require_librarian),
):
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No changes given")

    if "year_level" in changes and changes["year_level"] is not None:
        if not (1 <= changes["year_level"] <= MAX_YEAR_LEVEL):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Year Level must be between 1 and {MAX_YEAR_LEVEL}")
    if "program" in changes and changes["program"] is not None:
        changes["program"] = changes["program"].strip() or None

    admin = get_admin_client()
    res = admin.table("profiles").update(changes).eq("id", user_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patron not found")
    return res.data[0]
