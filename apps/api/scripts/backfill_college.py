# One-off: sets each book's college (the `subject` column) from the Excel
# files, for books seeded before colleges were tagged. Matches by title,
# since those books have no accession numbers; --dry-run checks the titles
# still match one-to-one before writing anything.
#
# Usage: venv/Scripts/python.exe scripts/backfill_college.py [--dry-run]

import sys
import re
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so `core.*` resolves

from excel_source import read_records
from core.embeddings import reembed_books
from core.supabase import get_admin_client
from seed_books import SOURCE_FILES  # same filename -> college mapping seed_books.py uses

BATCH_SIZE = 100

def normalize_ws(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = re.sub(r"\s+", " ", value).strip()
    return cleaned or None

def titles_by_college() -> dict[str, list[str]]:
    data_dir = Path(__file__).resolve().parent.parent / "data"
    result: dict[str, list[str]] = {}

    for fname, college in SOURCE_FILES.items():
        path = data_dir / fname
        if not path.exists():
            print(f"SKIP: {fname} not found in {data_dir}")
            continue
        records = read_records(path)
        titles = [
            t for r in records
            if (t := normalize_ws(r["Title"]))
        ]
        result[college] = titles
        print(f"{fname}: {len(titles)} titles -> {college}")

    return result

def main(dry_run: bool = False) -> None:
    by_college = titles_by_college()
    total = sum(len(titles) for titles in by_college.values())
    print(f"\nTotal titles to tag: {total}")

    client = get_admin_client()

    if dry_run:
        print("\n--dry-run: checking how many of these titles actually exist in Supabase (no writes)...")
        matched = 0
        for college, titles in by_college.items():
            college_matched = 0
            for i in range(0, len(titles), BATCH_SIZE):
                batch = titles[i:i + BATCH_SIZE]
                res = client.table("books").select("id").in_("title", batch).execute()
                college_matched += len(res.data or [])
            matched += college_matched
            print(f"  {college}: {college_matched}/{len(titles)} titles found in Supabase")
        print(f"\n--dry-run: {matched}/{total} would be tagged. Not updating.")
        return

    updated = 0
    for college, titles in by_college.items():
        for i in range(0, len(titles), BATCH_SIZE):
            batch = titles[i:i + BATCH_SIZE]
            res = (
                client.table("books")
                .update({"subject": college})
                .in_("title", batch)
                .execute()
            )
            n = len(res.data or [])
            updated += n
            print(f"  {college}: tagged {n} rows (batch of {len(batch)} titles)")

    print(f"\nDone. {updated} existing book rows tagged with a college.")

    # The college is part of each book's search embedding, so re-embed.
    print("\nRe-embedding tagged books so search reflects the new college...")
    embedded = reembed_books(client)
    print(f"Re-embedded {embedded} book(s).")

if __name__ == "__main__":
    main(dry_run="--dry-run" in sys.argv)
