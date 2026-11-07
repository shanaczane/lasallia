import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
FRONTEND_ORIGIN_REGEX = os.getenv("FRONTEND_ORIGIN_REGEX", "")

# Optional: the app runs without it; only search fails until it's set.
OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")

# Optional: without it, notifications are in-app only (emails are skipped).
RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")

# Signs the librarian "active profile" token. Without it, profile sign-in
# and librarian write actions are refused.
LIBRARIAN_PROFILE_SECRET: str = os.getenv("LIBRARIAN_PROFILE_SECRET", "")

# Sent by pg_cron to /internal/*. Without it, those endpoints are refused.
INTERNAL_CRON_SECRET: str = os.getenv("INTERNAL_CRON_SECRET", "")

_missing = [
    name for name, val in {
        "SUPABASE_URL": SUPABASE_URL,
        "SUPABASE_ANON_KEY": SUPABASE_ANON_KEY,
    }.items() if not val
]
if _missing:
    raise RuntimeError(f"Missing required env vars: {', '.join(_missing)}")
