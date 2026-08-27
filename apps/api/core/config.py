import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
FRONTEND_ORIGIN_REGEX = os.getenv("FRONTEND_ORIGIN_REGEX", "")

# Not in the required-vars check below — the app must keep running
# without one. core/embeddings.py is what fails loudly, and only when
# search is actually called, until a real key is added.
OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")

_missing = [
    name for name, val in {
        "SUPABASE_URL": SUPABASE_URL,
        "SUPABASE_ANON_KEY": SUPABASE_ANON_KEY,
    }.items() if not val
]
if _missing:
    raise RuntimeError(f"Missing required env vars: {', '.join(_missing)}")
