"""Chatbot tools for the student's own account. Security-critical.

`user` always comes from the server (the verified login), never from the
model. Never add a student_id/user_id parameter: a prompt like "show me
Maria's fines" must be impossible, not just refused.

Fines are columns on `loans`, so get_my_fines returns loans. Accession
numbers aren't hidden here because the student already has the book.
"""

from datetime import datetime, timezone

from core.supabase import get_admin_client
from schemas.auth import UserProfile
from schemas.loan import Loan


def _fetch_my_loans(user: UserProfile) -> list[dict]:
    """All of `user`'s loans with their books. `user.id` comes from the
    verified login, never from a tool argument."""
    admin = get_admin_client()
    loans = (
        admin.table("loans")
        .select("*")
        .eq("student_id", user.id)
        .order("borrowed_at", desc=True)
        .execute()
    ).data

    copy_ids = list({l["book_copy_id"] for l in loans})
    books_by_copy_id: dict[str, dict | None] = {}
    if copy_ids:
        copies = admin.table("book_copies").select("id, book_id").in_("id", copy_ids).execute().data
        book_ids = list({c["book_id"] for c in copies})
        books = admin.table("books").select("*").in_("id", book_ids).execute().data if book_ids else []
        books_by_id = {b["id"]: b for b in books}
        books_by_copy_id = {c["id"]: books_by_id.get(c["book_id"]) for c in copies}
    for l in loans:
        l["books"] = books_by_copy_id.get(l["book_copy_id"])

    # The database doesn't flip loans to "overdue" itself, so work it out here.
    now = datetime.now(timezone.utc)
    for l in loans:
        if l["status"] == "active" and datetime.fromisoformat(l["due_date"]) < now:
            l["status"] = "overdue"

    return loans


def get_my_loans(user: UserProfile) -> list[Loan]:
    """Current (active/overdue) loans for `user`."""
    loans = [l for l in _fetch_my_loans(user) if l["status"] in ("active", "overdue")]
    return [Loan(**l) for l in loans]


def get_my_fines(user: UserProfile) -> list[Loan]:
    """`user`'s loans with an unpaid fine."""
    loans = [l for l in _fetch_my_loans(user) if l.get("fine_status") == "unsettled"]
    return [Loan(**l) for l in loans]


def get_my_history(user: UserProfile) -> list[Loan]:
    """`user`'s past (returned) loans."""
    loans = [l for l in _fetch_my_loans(user) if l["status"] == "returned"]
    return [Loan(**l) for l in loans]


GET_MY_LOANS_SCHEMA: dict = {
    "type": "function",
    "function": {
        "name": "get_my_loans",
        "description": "Get the current student's active loans and due dates. No parameters — always resolves to whoever is logged in.",
        "parameters": {"type": "object", "properties": {}},
    },
}

GET_MY_FINES_SCHEMA: dict = {
    "type": "function",
    "function": {
        "name": "get_my_fines",
        "description": "Get the current student's outstanding fines. No parameters — always resolves to whoever is logged in.",
        "parameters": {"type": "object", "properties": {}},
    },
}

GET_MY_HISTORY_SCHEMA: dict = {
    "type": "function",
    "function": {
        "name": "get_my_history",
        "description": "Get the current student's past loan history. No parameters — always resolves to whoever is logged in.",
        "parameters": {"type": "object", "properties": {}},
    },
}
