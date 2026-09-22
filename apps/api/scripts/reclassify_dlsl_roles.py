# apps/api/scripts/reclassify_dlsl_roles.py
# One-time (and re-run-as-needed) fixup for accounts created before
# handle_new_user() knew how to guess student vs faculty from the email's
# local part (dots-no-underscore -> faculty, e.g. khatrina.joice.gonzales@;
# underscore -> student, e.g. shana_czane_cruzat@ — see the migration this
# script's neighbor, import_rfid_enrollment.py, sits beside). The trigger
# only runs on INSERT, so it never touches a profile row that already
# existed when it was updated — this is the retroactive half of that fix.
#
# Two different things get reported, on purpose not treated the same way:
#
#   1. "guest despite a @dlsl.edu.ph email" — unambiguous bug. A verified
#      DLSL address should never have landed as guest; every one of these
#      is auto-corrected (unless --dry-run).
#
#   2. "student/faculty but the email pattern disagrees" — NOT
#      auto-corrected. A librarian may have already fixed one of these by
#      hand from the Patrons screen's "Mark as Faculty/Student" button
#      (routers/patrons.py) for someone whose email happens to break the
#      dot/underscore convention; silently flipping it back here would undo
#      a deliberate correction. These are only printed, for a human to look
#      at and fix (or ignore) individually.
#
# Never touches a librarian row — role changes for that account type are a
# direct DB edit, same rule routers/patrons.py's PATCH /users/{id} enforces.
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
