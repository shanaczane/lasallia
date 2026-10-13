# apps/api/jobs/expire_reservations.py
# Expires every 'ready' reservation whose pickup window has passed and
# hands each copy to the next student in line (or sends it to reshelving).
# The API already does this opportunistically on normal traffic (see
# core/reservations.py's maybe_sweep_expired_reservations); this script is
# for running it on a schedule once one exists, or by hand.
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
