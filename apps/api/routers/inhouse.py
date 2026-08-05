from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from core.deps import require_librarian
from core.supabase import get_admin_client
from schemas.auth import UserProfile
from schemas.inhouse import CreateInHouseLoanRequest, InHouseLoan

router = APIRouter(prefix="/in-house-loans", tags=["in-house-loans"])

# Plan 7: entirely librarian-driven — a guest has no session, no JWT, and
# never calls any endpoint in this router themselves.

@router.get("", response_model=list[InHouseLoan])
def list_in_house_loans(
    status_filter: str | None = None,
    librarian: UserProfile = Depends(require_librarian),
):
    db = get_admin_client()
    query = db.table("in_house_loans").select("*, book_copies(accession_number, books(*))").order("checked_out_at", desc=True)
    if status_filter:
        query = query.eq("status", status_filter)
    res = query.execute()
    loans = res.data
    for loan in loans:
        copy = loan.pop("book_copies", None)
        loan["books"] = copy["books"] if copy else None
        loan["accession_number"] = copy["accession_number"] if copy else None
    return loans

@router.post("", response_model=InHouseLoan, status_code=status.HTTP_201_CREATED)
def create_in_house_loan(
    body: CreateInHouseLoanRequest,
    librarian: UserProfile = Depends(require_librarian),
):
    db = get_admin_client()

    copy_res = db.table("book_copies").select("*").eq("accession_number", body.accession_number.strip()).execute()
    if not copy_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No copy with that accession number")
    copy = copy_res.data[0]
    if copy["status"] != "available":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"This copy is currently '{copy['status']}', not available")

    if body.visitor_type == "non_nocei" and not body.fee_paid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The ₱50.00 visitor fee must be collected before checkout")

    loan_res = db.table("in_house_loans").insert({
        "book_copy_id": copy["id"],
        "librarian_id": librarian.id,
        "guest_name": body.guest_name.strip(),
        "guest_id_number": body.guest_id_number.strip(),
        "visitor_type": body.visitor_type,
        "fee_paid": body.fee_paid,
        "purpose": body.purpose,
        "notes": body.notes,
    }).execute()
    if not loan_res.data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not create the in-house loan")

    # available -> on_loan: legal per Phase 1's status machine. Correctly
    # takes the copy out of circulation while the guest has it, exactly
    # like a real loan does — it's just not going home with them.
    db.table("book_copies").update({"status": "on_loan"}).eq("id", copy["id"]).execute()

    loan = loan_res.data[0]
    book_res = db.table("books").select("*").eq("id", copy["book_id"]).execute()
    loan["books"] = book_res.data[0] if book_res.data else None
    loan["accession_number"] = copy["accession_number"]
    return loan

@router.post("/{loan_id}/return", response_model=InHouseLoan)
def return_in_house_loan(
    loan_id: str,
    librarian: UserProfile = Depends(require_librarian),
):
    db = get_admin_client()

    loan_res = db.table("in_house_loans").select("*").eq("id", loan_id).execute()
    if not loan_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "In-house loan not found")
    loan = loan_res.data[0]
    if loan["status"] == "returned":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This item has already been returned")

    update_res = db.table("in_house_loans").update({
        "status": "returned",
        "returned_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", loan_id).execute()
    loan = update_res.data[0]

    # on_loan -> for_reshelving: never straight back to available, same
    # rule Phase 4 follows for real returns (build plan 4.6/4.7).
    copy_res = db.table("book_copies").select("id, book_id, accession_number").eq("id", loan["book_copy_id"]).execute()
    copy = copy_res.data[0]
    db.table("book_copies").update({"status": "for_reshelving"}).eq("id", copy["id"]).execute()

    book_res = db.table("books").select("*").eq("id", copy["book_id"]).execute()
    loan["books"] = book_res.data[0] if book_res.data else None
    loan["accession_number"] = copy["accession_number"]
    return loan
