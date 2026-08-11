# apps/api/scripts/ingest_handbook.py
# Chatbot Phase 4 — CLI wrapper around core/policy.py's
# ingest_handbook(), mirrors scripts/reembed_books.py's shape.
#
# Usage: venv/Scripts/python.exe scripts/ingest_handbook.py <path> <version>
# <path> may be a .pdf (extracted via pdfplumber, see core/policy.py) or
# an already-extracted .txt file in chunk_handbook's expected format.

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so `core.*` resolves

from core.policy import ingest_handbook
from core.supabase import get_admin_client

if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: ingest_handbook.py <path-to-pdf-or-txt> <version>")

    source = Path(sys.argv[1])
    version = sys.argv[2]
    if not source.exists():
        raise SystemExit(f"No such file: {source}")

    count = ingest_handbook(get_admin_client(), str(source), version)
    print(f"Ingested {count} chunk(s) from {source.name} as version '{version}'.")
