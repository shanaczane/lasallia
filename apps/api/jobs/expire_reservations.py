# Expires reservations whose pickup deadline passed. The API already does
# this every minute; this script runs it by hand.
#
# Usage: venv/Scripts/python.exe jobs/expire_reservations.py

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so `core.*` resolves

from core.reservations import sweep_expired_reservations
from core.supabase import get_admin_client

if __name__ == "__main__":
    count = sweep_expired_reservations(get_admin_client())
    print(f"Expired {count} reservation(s) past their pickup window.")
