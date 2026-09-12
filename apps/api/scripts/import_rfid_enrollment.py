# apps/api/scripts/import_rfid_enrollment.py
# One-time (and re-run-as-needed) import: reads the librarian-filled
# RFID/NFC card enrollment spreadsheet and saves each row's Card UID onto
# the matching student's profile, via the service-role client (bypasses
# RLS — this is an admin operation, not a user-facing write).
#
# Matches rows to students by email (profiles has no student-number
# column — email is the only reliably-unique identifying field a
# spreadsheet row can carry). Skips blank template rows, refuses to
# silently overwrite a UID already assigned to a DIFFERENT student (a
# unique constraint on profiles.rfid_uid would reject that anyway, but
# checking first gives a readable error instead of a raw DB exception),
# and no-ops a row that already matches what's stored.
#
# Usage: venv/Scripts/python.exe scripts/import_rfid_enrollment.py [--dry-run]

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so `core.*` resolves

import openpyxl

from core.supabase import get_admin_client

SOURCE_PATH = Path(__file__).resolve().parent.parent / "data" / "rfid_card_enrollment.xlsx"
SHEET_NAME = "Card Enrollment"


def read_rows(xlsx_path: Path) -> list[dict]:
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    ws = wb[SHEET_NAME]
    header = [c.value for c in next(ws.iter_rows(min_row=1, max_row=1))]
    col = {name: i for i, name in enumerate(header)}

    rows = []
    for raw in ws.iter_rows(min_row=2, values_only=True):
        email = (raw[col["Email"]] or "").strip() if raw[col["Email"]] else ""
        uid = (raw[col["Card UID"]] or "").strip() if raw[col["Card UID"]] else ""
        if not email or not uid:
            continue  # blank template row — nothing to import
        rows.append({
            "full_name": raw[col["Full Name"]],
            "email": email,
            "card_uid": uid,
        })
    return rows


def run(dry_run: bool) -> None:
    admin = get_admin_client()
    rows = read_rows(SOURCE_PATH)

    updated, unchanged, errors = [], [], []

    for row in rows:
        profile_res = admin.table("profiles").select("id, full_name, rfid_uid").eq("email", row["email"]).execute()
        if not profile_res.data:
            errors.append(f"{row['email']}: no student account with this email exists")
            continue
        profile = profile_res.data[0]

        if profile["rfid_uid"] == row["card_uid"]:
            unchanged.append(row["email"])
            continue

        conflict_res = admin.table("profiles").select("id, full_name").eq("rfid_uid", row["card_uid"]).execute()
        if conflict_res.data and conflict_res.data[0]["id"] != profile["id"]:
            other = conflict_res.data[0]["full_name"]
            errors.append(f"{row['email']}: Card UID {row['card_uid']!r} is already assigned to {other!r}")
            continue

        if not dry_run:
            admin.table("profiles").update({"rfid_uid": row["card_uid"]}).eq("id", profile["id"]).execute()
        updated.append(f"{row['email']} -> {row['card_uid']}")

    label = "Would update" if dry_run else "Updated"
    print(f"{label} {len(updated)} student(s):")
    for line in updated:
        print(f"  - {line}")
    if unchanged:
        print(f"\nAlready up to date ({len(unchanged)}): {', '.join(unchanged)}")
    if errors:
        print(f"\n{len(errors)} row(s) need attention:")
        for e in errors:
            print(f"  ! {e}")


if __name__ == "__main__":
    run(dry_run="--dry-run" in sys.argv)
