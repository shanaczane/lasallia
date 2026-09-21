import ssl
import threading
import time
from collections import OrderedDict

import certifi
import httpx
from postgrest import SyncPostgrestClient
from postgrest.constants import DEFAULT_POSTGREST_CLIENT_TIMEOUT
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
#
# Only PostgREST is needed here (every caller just does .table()/.rpc()), so
# this builds a bare PostgREST client instead of a full supabase client —
# create_client() also initialises auth/storage/realtime/functions clients and
# cost ~1.1 s per request, which was most of the wait on every logged-in page.
# What actually cost the time was building an SSL context (~0.4 s, loads the CA
# bundle) inside every new HTTP client — so one context is built once and shared.
# Clients are cached per exact token string (so one only ever carries the
# Authorization header of the person who owns that token) to reuse the open
# connection on that user's next request; small and short-lived on purpose.
_SHARED_SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
_USER_CLIENT_TTL_SECONDS = 600
_USER_CLIENT_MAX = 256
_user_clients: "OrderedDict[str, tuple[float, SyncPostgrestClient]]" = OrderedDict()
_user_clients_lock = threading.Lock()

def get_user_client(access_token: str) -> SyncPostgrestClient:
    now = time.monotonic()
    with _user_clients_lock:
        hit = _user_clients.get(access_token)
        if hit and now - hit[0] < _USER_CLIENT_TTL_SECONDS:
            _user_clients.move_to_end(access_token)
            return hit[1]

    base_url = f"{SUPABASE_URL}/rest/v1"
    session = httpx.Client(
        base_url=base_url,
        verify=_SHARED_SSL_CONTEXT,
        # HTTP/1.1 on purpose: this client is shared by every request carrying the
        # same token, and several arrive at once when a page loads. httpx's HTTP/1.1
        # pool is thread-safe; a shared HTTP/2 connection dropped some of them.
        http2=False,
        timeout=DEFAULT_POSTGREST_CLIENT_TIMEOUT,
        follow_redirects=True,
    )
    client = SyncPostgrestClient(
        base_url,
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {access_token}",
        },
        http_client=session,
    )
    with _user_clients_lock:
        _user_clients[access_token] = (now, client)
        while len(_user_clients) > _USER_CLIENT_MAX:
            _, (_, evicted) = _user_clients.popitem(last=False)
            try:
                evicted.aclose()
            except Exception:
                pass
    return client
