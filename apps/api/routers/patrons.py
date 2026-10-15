from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from core.deps import get_user_supabase, require_librarian
from core.supabase import get_admin_client
from core.email_template import EmailContent
from core.notify import email_user
from schemas.auth import UserProfile
from schemas.patron import Patron, UpdatePatronRequest

router = APIRouter(prefix="/users", tags=["patrons"])

MAX_YEAR_LEVEL = 8  # generous ceiling — covers every real program length (4-6 yrs) with room to spare

# Same shape as routers/books.py's _check_accession_conflict / routers/
# auth.py's own copy of this check for a self-service edit — pre-checked
# with a SELECT rather than relying on the DB's unique index (0045) to
# reject it, so a collision comes back as a readable 400 instead of a raw
# integrity-error 500.
def _check_id_number_conflict(admin, id_number: str, exclude_user_id: str) -> None:
    res = admin.table("profiles").select("id").eq("id_number", id_number).neq("id", exclude_user_id).execute()
    if res.data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f'ID number "{id_number}" is already in use by another patron')

# Librarian-only management view over every registered account (build plan
# 5.5). profiles_select_librarian (0008) is a role check, not a row check —
# is_librarian() doesn't reference the row at all — so it grants a
# librarian's own JWT a real bulk SELECT over every profile, not just their
# own. RLS-scoped client is enough here; require_librarian is what actually
# keeps a student from reaching this endpoint at all.

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

    # Filtered in Python rather than a PostgREST ilike filter — same
    # reasoning as loans.py's search_loans: avoids building a filter string
    # out of caller-supplied text, and the patron list is small enough that
    # this costs nothing. Used by the librarian-assisted borrow flow's
    # student picker (?q=&role=student) as well as the Patrons screen.
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

    # A librarian deactivating themselves would lock their own session out
    # immediately (core/deps.py rejects inactive accounts on every request),
    # and could leave the library with no librarian able to undo it. The
    # Patrons screen disables the option too, but this is the real guard.
    # Sprint 5.5.3
    if changes.get("status") == "inactive" and user_id == librarian.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't deactivate your own account.")

    # A patron currently holding a book is still accountable for it — losing
    # access (and showing up as "inactive" everywhere) shouldn't be a way to
    # dodge that. Same active/overdue definition reservations.py's own
    # same-account check uses.
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

    # Tell the patron when their access changes. Email only — a deactivated
    # account can't sign in to see an in-app notice anyway.
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
