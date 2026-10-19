# Fixes roles on older accounts, guessing from the email: dots only means
# faculty (first.last@), an underscore means student (first_last@).
#
#   1. DLSL emails stuck as "guest" are corrected (unless --dry-run).
#   2. Student/faculty roles that don't match the email are only listed,
#      since a librarian may have set them on purpose.
#
# Librarian accounts are never changed.
#
# Usage: venv/Scripts/python.exe scripts/reclassify_dlsl_roles.py [--dry-run]

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so `core.*` resolves

from core.supabase import get_admin_client

DLSL_DOMAIN = "@dlsl.edu.ph"


def guess_role(email: str) -> str:
    local = email.split("@", 1)[0]
    if re.search(r"\.", local) and not re.search(r"_", local):
        return "faculty"
    return "student"  # underscore, or anything ambiguous — same fallback handle_new_user() uses


def run(dry_run: bool) -> None:
    admin = get_admin_client()
    profiles = (
        admin.table("profiles")
        .select("id, email, full_name, role")
        .in_("role", ["guest", "student", "faculty"])
        .execute()
        .data
    )
    dlsl_profiles = [p for p in profiles if p["email"] and p["email"].lower().endswith(DLSL_DOMAIN)]

    fixed_guests: list[str] = []
    pattern_mismatches: list[str] = []

    for p in dlsl_profiles:
        guessed = guess_role(p["email"])
        who = f"{p['email']} ({p['full_name'] or 'no name on file'})"

        if p["role"] == "guest":
            if not dry_run:
                admin.table("profiles").update({"role": guessed}).eq("id", p["id"]).execute()
            fixed_guests.append(f"{who}: guest -> {guessed}")
        elif p["role"] != guessed:
            pattern_mismatches.append(f"{who}: currently {p['role']}, email pattern suggests {guessed}")

    label = "Would fix" if dry_run else "Fixed"
    print(f"{label} {len(fixed_guests)} account(s) wrongly stuck as guest:")
    for line in fixed_guests:
        print(f"  - {line}")

    if pattern_mismatches:
        print(f"\n{len(pattern_mismatches)} account(s) disagree with the email pattern (not changed — check these by hand):")
        for line in pattern_mismatches:
            print(f"  ? {line}")

    if not fixed_guests and not pattern_mismatches:
        print("Nothing to do — every @dlsl.edu.ph account already matches its email pattern.")


if __name__ == "__main__":
    run(dry_run="--dry-run" in sys.argv)
