# apps/api/scripts/ingest_handbook.py
# Chatbot Phase 4 — CLI wrapper around core/policy.py's
# ingest_handbook(), mirrors scripts/reembed_books.py's shape.
#
# Usage: venv/Scripts/python.exe scripts/ingest_handbook.py <path> <version>

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so `core.*` resolves

from core.policy import ingest_handbook
from core.supabase import get_admin_client

if __name__ == "__main__":
    raise NotImplementedError("Phase 4 — argument parsing and the ingest_handbook() call go here")
