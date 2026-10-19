# Puts back copies stuck as on_loan/overdue/reserved with no loan or
# reservation behind them. Like the reshelving scan, a waiting reservation
# gets the copy first. Run only once the copies are on the shelf.
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

        # Overdue copies can't go straight to reserved, so they pass
        # through for_reshelving first.
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
