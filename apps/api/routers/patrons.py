from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from core.deps import get_user_supabase, require_librarian
from core.supabase import get_admin_client
from core.email_template import EmailContent
from core.notify import email_user
from schemas.auth import UserProfile
from schemas.patron import Patron, UpdatePatronRequest

router = APIRouter(prefix="/users", tags=["patrons"])

MAX_YEAR_LEVEL = 8  # above any real program length

# Checked up front so a duplicate ID number gives a clear 400, not a 500.
def _check_id_number_conflict(admin, id_number: str, exclude_user_id: str) -> None:
    res = admin.table("profiles").select("id").eq("id_number", id_number).neq("id", exclude_user_id).execute()
    if res.data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f'ID number "{id_number}" is already in use by another patron')

# Librarian view of every account. RLS lets librarians read all profiles;
# require_librarian keeps everyone else out.

@router.get("", response_model=list[Patron])
def list_patrons(
    q: str | None = None,
    role: str | None = None,
    librarian: UserProfile = Depends(require_librarian),
    db: Client = Depends(get_user_supabase),
):
    query = db.table("profiles").select("*")
    if role:
        query = query.eq("role", role)
    patrons = query.order("full_name").execute().data

    # Filtered in Python so user text never goes into a query filter. The
    # list is small, so this is cheap.
    needle = (q or "").strip().lower()
    if needle:
        patrons = [
            p for p in patrons
            if needle in (p.get("full_name") or "").lower()
            or needle in (p.get("email") or "").lower()
            or needle in (p.get("id_number") or "").lower()
        ]
    return patrons

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
    if "college" in changes and changes["college"] is not None:
        changes["college"] = changes["college"].strip() or None

    admin = get_admin_client()

    if "id_number" in changes and changes["id_number"] is not None:
        changes["id_number"] = changes["id_number"].strip() or None
        if changes["id_number"]:
            _check_id_number_conflict(admin, changes["id_number"], user_id)

    # A librarian can't deactivate themselves; they'd be locked out at once,
    # possibly with no other librarian to undo it.
    if changes.get("status") == "inactive" and user_id == librarian.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't deactivate your own account.")

    # Can't deactivate a patron who still has a book out.
    if changes.get("status") == "inactive":
        outstanding = (
            admin.table("loans")
            .select("id", count="exact")
            .eq("student_id", user_id)
            .in_("status", ["active", "overdue"])
            .execute()
        )
        count = outstanding.count or 0
        if count:
            plural = "s" if count != 1 else ""
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Cannot deactivate this patron — they have {count} outstanding loan{plural}. They must return their book{plural} first.",
            )

    previous_status = None
    if "status" in changes:
        prev = admin.table("profiles").select("status").eq("id", user_id).execute()
        previous_status = (prev.data[0].get("status") or "active") if prev.data else None

    res = admin.table("profiles").update(changes).eq("id", user_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patron not found")

    # Email the patron about the change (a deactivated account can't sign in
    # to see an in-app notice).
    new_status = changes.get("status")
    if new_status and previous_status and new_status != previous_status:
        email_user(user_id, _account_status_email(new_status))
    return res.data[0]


def _account_status_email(new_status: str) -> EmailContent:
    if new_status == "inactive":
        return EmailContent(
            subject="Your Lasallia account has been deactivated",
            intro="Your Lasallia account has been deactivated by the LRC.",
            details=[("Status", "Deactivated")],
            paragraphs=[
                "You won't be able to sign in, borrow, or reserve books while your account is deactivated. "
                "If you think this is a mistake, please visit the LRC counter or contact the library.",
            ],
        )
    return EmailContent(
        subject="Your Lasallia account has been reactivated",
        intro="Good news! Your Lasallia account has been reactivated by the LRC.",
        details=[("Status", "Active")],
        paragraphs=["You can now sign in, borrow, and reserve books again."],
        link_label="Sign in",
        link="/login",
    )
