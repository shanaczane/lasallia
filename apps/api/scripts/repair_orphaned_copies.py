# apps/api/scripts/repair_orphaned_copies.py
# Finds copies marked on_loan/overdue/reserved that nothing is actually
# holding — no active loan, no open in-house loan, no ready reservation —
# and puts them back into circulation. These come from loan/reservation
# rows that were deleted out from under their copy (see migration 0049)
# and from ready reservations that expired before the sweep learned to
# release their copy.
#
# Each copy is handled the way the reshelving scan handles it: the oldest
# pending reservation on the title gets it (and is notified), otherwise it
# goes back to available. Only run this once the copies are physically on
# the shelf.
#
# Usage: venv/Scripts/python.exe scripts/repair_orphaned_copies.py           (dry run)
#        venv/Scripts/python.exe scripts/repair_orphaned_copies.py --apply

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so `core.*` resolves

from core.reservations import promote_next_reservation
from core.supabase import get_admin_client


def find_orphans(admin) -> list[dict]:
    copies = (
        admin.table("book_copies")
        .select("id, accession_number, status, book_id, books(title)")
        .in_("status", ["on_loan", "overdue", "reserved"])
        .execute()
    ).data
    loaned = {
        l["book_copy_id"] for l in
        admin.table("loans").select("book_copy_id").in_("status", ["active", "overdue"]).execute().data
    }
    in_house = {
        l["book_copy_id"] for l in
        admin.table("in_house_loans").select("book_copy_id").neq("status", "returned").execute().data
    }
    held = {
        r["book_copy_id"] for r in
        admin.table("reservations").select("book_copy_id").eq("status", "ready").execute().data
    }
    return [c for c in copies if c["id"] not in loaned | in_house | held]


def main() -> None:
    apply = "--apply" in sys.argv
    admin = get_admin_client()
    orphans = find_orphans(admin)

    if not orphans:
        print("No orphaned copies found.")
        return

    for copy in orphans:
        title = (copy.get("books") or {}).get("title", "")
        if not apply:
            print(f"would release  {copy['accession_number']:<10} {copy['status']:<9} {title}")
            continue

        # on_loan/reserved -> reserved for a waiting student, otherwise
        # -> for_reshelving -> available. overdue can't go straight to
        # reserved, so it detours through for_reshelving (needs 0048).
        promoted = promote_next_reservation(admin, copy["book_id"], copy["id"])
        if promoted:
            if copy["status"] == "overdue":
                admin.table("book_copies").update({"status": "for_reshelving"}).eq("id", copy["id"]).execute()
            new_status = "reserved"
            admin.table("book_copies").update({"status": "reserved"}).eq("id", copy["id"]).execute()
        else:
            new_status = "available"
            admin.table("book_copies").update({"status": "for_reshelving"}).eq("id", copy["id"]).execute()
            admin.table("book_copies").update({"status": "available"}).eq("id", copy["id"]).execute()
        print(f"released       {copy['accession_number']:<10} {copy['status']:<9} -> {new_status:<9} {title}")

    if not apply:
        print(f"\n{len(orphans)} orphaned copies. Re-run with --apply to release them.")


if __name__ == "__main__":
    main()
