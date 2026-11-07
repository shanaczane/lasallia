# The borrower's ID tap at the desk (returns, fine payments, pickups) and
# the account notices shown after a tap at the kiosk.

from datetime import datetime, timezone

from fastapi import HTTPException, status

from core.calendar import overdue_fields

# loans links to profiles twice, so the borrower link has to be named.
LOAN_BORROWER = "profiles!loans_student_id_fkey(full_name, avatar_url, role, program, college, year_level)"

UNKNOWN_ID = "We don't recognize this ID — search for the student by name instead"


def tapped_user_id(db, rfid_uid: str) -> str:
    res = db.table("profiles").select("id").eq("rfid_uid", rfid_uid.strip()).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, UNKNOWN_ID)
    return res.data[0]["id"]


def how_identified(db, rfid_uid: str | None, student_id: str) -> str:
    """'id_tap' (the borrower's ID), 'id_tap_other' (someone else's) or
    'manual' (no tap)."""
    if not rfid_uid or not rfid_uid.strip():
        return "manual"
    return "id_tap" if tapped_user_id(db, rfid_uid) == student_id else "id_tap_other"


def tap_required(cfg: dict) -> bool:
    return bool(cfg.get("require_id_tap_at_desk"))


def ready_pickups(db, user_id: str) -> list[dict]:
    rows = (
        db.table("reservations").select("id, book_id, pickup_by")
        .eq("user_id", user_id).eq("status", "ready").execute()
    ).data
    if not rows:
        return []
    books = {
        b["id"]: b for b in
        db.table("books").select("id, title, author").in_("id", [r["book_id"] for r in rows]).execute().data
    }
    return [
        {
            "reservation_id": r["id"],
            "book_id": r["book_id"],
            "title": (books.get(r["book_id"]) or {}).get("title") or "A book",
            "author": (books.get(r["book_id"]) or {}).get("author"),
            "pickup_by": r.get("pickup_by"),
        }
        for r in rows
    ]


def unpaid_fine_loans(db, user_id: str) -> list[dict]:
    """Returned loans with a fine not yet paid, with their book."""
    loans = (
        db.table("loans").select("*, book_copies(accession_number, books(*))")
        .eq("student_id", user_id).eq("fine_status", "unsettled").execute()
    ).data
    for loan in loans:
        copy = loan.pop("book_copies", None) or {}
        loan["books"] = copy.get("books")
        loan["accession_number"] = copy.get("accession_number")
    return loans


def open_loans(db, user_id: str) -> list[dict]:
    """Loans still out, with the fine so far, like the return lookup."""
    loans = (
        db.table("loans")
        .select(f"*, book_copies(book_id, accession_number, books(*)), {LOAN_BORROWER}")
        .eq("student_id", user_id).in_("status", ["active", "overdue"]).execute()
    ).data
    now = datetime.now(timezone.utc)
    result = []
    for loan in loans:
        copy = loan.pop("book_copies", None) or {}
        loan["books"] = copy.get("books")
        loan["accession_number"] = copy.get("accession_number")
        if loan["status"] == "active" and datetime.fromisoformat(loan["due_date"]) < now:
            loan["status"] = "overdue"
        collection_type = (loan["books"] or {}).get("collection_type") or "General"
        loan.update(overdue_fields(db, loan["due_date"], collection_type))
        result.append(loan)
    result.sort(key=lambda l: l["due_date"])
    return result


def kiosk_notices(db, user_id: str) -> dict:
    """What the kiosk shows after a tap: books ready to pick up, and fines
    or overdue books that stop new borrowing (paid at the desk)."""
    fines = unpaid_fine_loans(db, user_id)
    now = datetime.now(timezone.utc)
    overdue = (
        db.table("loans").select("id, due_date")
        .eq("student_id", user_id).in_("status", ["active", "overdue"]).execute()
    ).data
    return {
        "ready_pickups": ready_pickups(db, user_id),
        "unpaid_fines_total": round(sum(float(l.get("fine_amount") or 0) for l in fines), 2),
        "unpaid_fines_count": len(fines),
        "overdue_count": sum(1 for l in overdue if datetime.fromisoformat(l["due_date"]) < now),
    }
