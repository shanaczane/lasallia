# apps/api/scripts/seed_books.py
# One-time import: reads the 4 LRC college Excel files and inserts them into
# the `books` table via the service-role client (bypasses RLS — this is an
# admin/seed operation, not a user-facing write).
#
# Usage: venv/Scripts/python.exe scripts/seed_books.py [--dry-run]

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so `core.*` resolves

from excel_source import read_records
from core.supabase import get_admin_client

SOURCE_FILES = ["CITE.xlsx", "CBEAM.xlsx", "CEAS.xlsx", "CITHM.xlsx"]
BATCH_SIZE = 50

import re

def normalize_ws(value: str | None) -> str | None:
    """Collapses any run of whitespace (including stray tabs/newlines from
    the source spreadsheet) into a single space."""
    if not value:
        return None
    cleaned = re.sub(r"\s+", " ", value).strip()
    return cleaned or None

def split_publisher(place_of_publication: str | None) -> str | None:
    """'Quezon City : Phoenix Publishing House.' -> 'Phoenix Publishing House'"""
    place_of_publication = normalize_ws(place_of_publication)
    if not place_of_publication:
        return None
    _, _, publisher = place_of_publication.partition(":")
    publisher = normalize_ws(publisher or place_of_publication)
    return publisher.rstrip(".,").strip() if publisher else None

def to_book_row(record: dict) -> dict:
    author = record["Author(s) Full Name"] or record["Author(s)"]
    year = record["Year"]
    return {
        "accession_no": normalize_ws(record["Book ID (Accession No.)"]),
        "title": normalize_ws(record["Title"]),
        "author": normalize_ws(author) or "Unknown",
        "isbn": record["ISBN"] or None,
        "call_number": normalize_ws(record["Call No."]) or "",
        "category": record["program"],
        "shelf_location": "Unassigned",
        "status": "available",
        "cover_url": record["Images"] or None,
        "abstract": record["Description"] or None,
        "published_year": int(year) if isinstance(year, (int, float)) else None,
        "publisher": split_publisher(record["Place of Publication"]),
        "format": "print",
        "total_copies": 1,
        "available_copies": 1,
    }

def main(dry_run: bool = False) -> None:
    data_dir = Path(__file__).resolve().parent.parent / "data"
    all_rows = []
    seen_accessions = set()

    for fname in SOURCE_FILES:
        path = data_dir / fname
        if not path.exists():
            print(f"SKIP: {fname} not found in {data_dir}")
            continue
        records = read_records(path)
        rows = [to_book_row(r) for r in records]

        deduped = []
        for row in rows:
            acc = row["accession_no"]
            if acc and acc in seen_accessions:
                print(f"  WARNING: duplicate accession_no {acc!r} in {fname}, skipping")
                continue
            if acc:
                seen_accessions.add(acc)
            deduped.append(row)

        print(f"{fname}: {len(deduped)} books")
        all_rows.extend(deduped)

    print(f"\nTotal: {len(all_rows)} books to insert")

    if dry_run:
        print("\n--dry-run: not inserting. Sample row:")
        print(all_rows[0])
        return

    client = get_admin_client()
    inserted = 0
    for i in range(0, len(all_rows), BATCH_SIZE):
        batch = all_rows[i:i + BATCH_SIZE]
        client.table("books").insert(batch).execute()
        inserted += len(batch)
        print(f"  inserted {inserted}/{len(all_rows)}")

    print(f"\nDone. {inserted} books inserted into Supabase.")

if __name__ == "__main__":
    main(dry_run="--dry-run" in sys.argv)
