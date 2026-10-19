# Re-embeds changed books for search. Same as POST /search/reembed.
#
# Usage: venv/Scripts/python.exe scripts/reembed_books.py [--all]

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so `core.*` resolves

from core.embeddings import reembed_books
from core.supabase import get_admin_client

if __name__ == "__main__":
    force_all = "--all" in sys.argv
    updated = reembed_books(get_admin_client(), force_all=force_all)
    print(f"Re-embedded {updated} book(s).")
