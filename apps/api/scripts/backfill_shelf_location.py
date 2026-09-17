# apps/api/scripts/backfill_shelf_location.py
# One-off backfill for books that were already inserted by seed_books.py
# before it started assigning shelf_location/aisle from the call number.
# Re-reads the same 4 LRC college Excel files and UPDATEs the
# `shelf_location` / `aisle` columns on the matching Supabase row — no rows
# are deleted or re-inserted, so borrow history / manual edits on existing
# rows are untouched.
#
# Matched on `title`, same as backfill_college.py (see that file for why
# accession_no can't be used here — these rows predate accession capture).
#
# Usage: venv/Scripts/python.exe scripts/backfill_shelf_location.py [--dry-run]

import sys
import re
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so `core.*` resolves

from excel_source import read_records
from shelf_location import classify_call_number
from core.supabase import get_admin_client
from seed_books import SOURCE_FILES  # same filename -> college mapping seed_books.py uses

BATCH_SIZE = 100

def normalize_ws(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = re.sub(r"\s+", " ", value).strip()
    return cleaned or None

def shelf_by_title() -> dict[str, dict]:
    """title -> {"shelf_location": ..., "aisle": ...}, across all 4 files."""
    data_dir = Path(__file__).resolve().parent.parent / "data"
    result: dict[str, dict] = {}

    for fname in SOURCE_FILES:
        path = data_dir / fname
        if not path.exists():
            print(f"SKIP: {fname} not found in {data_dir}")
            continue
        records = read_records(path)
        for r in records:
            title = normalize_ws(r["Title"])
            if not title:
                continue
            call_number = normalize_ws(r["Call No."]) or ""
            result[title] = classify_call_number(call_number)
        print(f"{fname}: {len(records)} titles read")

    return result

def main(dry_run: bool = False) -> None:
    by_title = shelf_by_title()
    print(f"\nTotal titles to backfill: {len(by_title)}")

    client = get_admin_client()

    # Group titles by their target (shelf_location, aisle) so each distinct
    # value is one batched UPDATE instead of one request per book.
    groups: dict[tuple[str, str | None], list[str]] = {}
    for title, shelf in by_title.items():
        key = (shelf["shelf_location"], shelf["aisle"])
        groups.setdefault(key, []).append(title)

    if dry_run:
        print("\n--dry-run: checking how many of these titles actually exist in Supabase (no writes)...")
        matched = 0
        for (shelf_location, aisle), titles in groups.items():
            group_matched = 0
            for i in range(0, len(titles), BATCH_SIZE):
                batch = titles[i:i + BATCH_SIZE]
                res = client.table("books").select("id").in_("title", batch).execute()
                group_matched += len(res.data or [])
            matched += group_matched
            print(f"  {shelf_location:12} {group_matched}/{len(titles)} titles found in Supabase")
        print(f"\n--dry-run: {matched}/{len(by_title)} would be backfilled. Not updating.")
        return

    updated = 0
    for (shelf_location, aisle), titles in groups.items():
        for i in range(0, len(titles), BATCH_SIZE):
            batch = titles[i:i + BATCH_SIZE]
            res = (
                client.table("books")
                .update({"shelf_location": shelf_location, "aisle": aisle})
                .in_("title", batch)
                .execute()
            )
            n = len(res.data or [])
            updated += n
            print(f"  {shelf_location:12} backfilled {n} rows (batch of {len(batch)} titles)")

    print(f"\nDone. {updated} existing book rows backfilled with a shelf location.")

if __name__ == "__main__":
    main(dry_run="--dry-run" in sys.argv)
