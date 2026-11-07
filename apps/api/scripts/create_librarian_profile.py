# Creates a librarian profile from the command line. Needed once, for the
# first profile: Manage Librarians can only be opened by an active profile.
#
# Usage (from apps/api): venv/Scripts/python.exe scripts/create_librarian_profile.py "Full Name"
# The PIN is asked for and never shown.

import getpass
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so `core.*` resolves

from core.librarian_profiles import hash_pin
from core.supabase import get_admin_client
from schemas.librarian_profile import PIN_PATTERN


def main() -> None:
    if len(sys.argv) != 2 or not sys.argv[1].strip():
        sys.exit('Usage: python scripts/create_librarian_profile.py "Full Name"')
    full_name = sys.argv[1].strip()

    pin = getpass.getpass("PIN (4-6 digits): ")
    if not re.match(PIN_PATTERN, pin):
        sys.exit("The PIN must be 4 to 6 digits.")
    if getpass.getpass("Repeat the PIN: ") != pin:
        sys.exit("The PINs don't match.")

    admin = get_admin_client()
    if admin.table("librarian_profiles").select("id").ilike("full_name", full_name).execute().data:
        sys.exit(f'A profile named "{full_name}" already exists.')
    admin.table("librarian_profiles").insert({"full_name": full_name, "pin_hash": hash_pin(pin)}).execute()
    print(f'Created the librarian profile for "{full_name}".')


if __name__ == "__main__":
    main()
