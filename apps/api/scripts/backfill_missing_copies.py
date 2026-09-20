# apps/api/scripts/backfill_missing_copies.py
# One-off backfill: seed_books.py (and any other path that inserts
# directly into `books`) only ever writes the `books` row — it never
# creates the matching `book_copies` row a title needs to show up
# anywhere copy-based (Shelf List, Total Copies, borrow/return). Finds
# every non-archived book with zero book_copies rows and creates exactly
# one, using the book's own accession_no — the same shape every other
# copy row already has (see a normal book_copies row: accession_number =
# books.accession_no, status "available", shelf_location "Unassigned").
#
# Only handles the total_copies == 1 case, which is all seed_books.py
# has ever produced — a title seeded with more than one intended copy
# has no per-copy accession numbers to draw from, so those are skipped
# and printed for manual handling instead of guessing.
#
# Usage: venv/Scripts/python.exe scripts/backfill_missing_copies.py [--dry-run]

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so `core.*` resolves

from core.supabase import get_admin_client

BATCH_SIZE = 50


def main(dry_run: bool = False) -> None:
    client = get_admin_client()

    books = (
        client.table("books")
        .select("id, title, accession_no, total_copies")
        .is_("archived_at", "null")
        .execute()
    ).data
    book_ids = [b["id"] for b in books]

    existing = client.table("book_copies").select("book_id").in_("book_id", book_ids).execute().data
    have_copies = {c["book_id"] for c in existing}

    missing = [b for b in books if b["id"] not in have_copies]
    print(f"{len(books)} active books, {len(missing)} with zero book_copies rows")

    fixable = [b for b in missing if b.get("accession_no") and (b.get("total_copies") or 1) == 1]
    unfixable = [b for b in missing if b not in fixable]

    if unfixable:
        print(f"\n{len(unfixable)} can't be auto-backfilled (no accession_no, or total_copies != 1):")
        for b in unfixable:
            print(f"  - {b['title']!r} (id={b['id']}, accession_no={b.get('accession_no')!r}, total_copies={b.get('total_copies')})")

    if not fixable:
        print("\nNothing to backfill.")
        return

    print(f"\n{len(fixable)} will get one book_copies row each:")
    for b in fixable:
        print(f"  - {b['title']!r} -> accession {b['accession_no']}")

    if dry_run:
        print("\n--dry-run: not inserting.")
        return

    rows = [
        {"book_id": b["id"], "accession_number": b["accession_no"], "status": "available", "shelf_location": "Unassigned"}
        for b in fixable
    ]
    inserted = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        client.table("book_copies").insert(batch).execute()
        inserted += len(batch)

    print(f"\nDone. {inserted} book_copies rows inserted.")


if __name__ == "__main__":
    main(dry_run="--dry-run" in sys.argv)
