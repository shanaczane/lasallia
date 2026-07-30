from supabase import create_client, Client
from core.config import SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

# Public client — uses anon key, respects RLS
_client: Client | None = None

def get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    return _client

# Admin client — bypasses RLS; use only for server-side admin operations
_admin_client: Client | None = None

def get_admin_client() -> Client:
    global _admin_client
    if _admin_client is None:
        _admin_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _admin_client

# User-scoped client — anon key + the caller's own access token, so RLS
# policies see auth.uid() as that user. This is the real authorization
# boundary for anything row-owner-scoped (reservations, borrow history):
# the caller only ever sees/touches what their own RLS policies allow.
def get_user_client(access_token: str) -> Client:
    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    client.postgrest.auth(access_token)
    return client
