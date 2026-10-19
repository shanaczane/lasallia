import ssl
import threading
import time
from collections import OrderedDict

import certifi
import httpx
from postgrest import SyncPostgrestClient
from postgrest.constants import DEFAULT_POSTGREST_CLIENT_TIMEOUT
from supabase import create_client, Client, ClientOptions
from core.config import SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

# Use HTTP/1.1: these clients are shared across threads, and a shared
# HTTP/2 connection can fail all requests on it at once.
def _http1_options() -> ClientOptions:
    return ClientOptions(
        httpx_client=httpx.Client(
            http2=False,
            timeout=DEFAULT_POSTGREST_CLIENT_TIMEOUT,
            follow_redirects=True,
        )
    )

# Public client — uses anon key, respects RLS
_client: Client | None = None

def get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY, _http1_options())
    return _client

# Admin client — bypasses RLS; use only for server-side admin operations
_admin_client: Client | None = None

def get_admin_client() -> Client:
    global _admin_client
    if _admin_client is None:
        _admin_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, _http1_options())
    return _admin_client

# User client: runs queries as the logged-in user, so RLS policies decide
# what they can see. This is the real security check for per-user data.
#
# A bare PostgREST client with a shared SSL context is much faster than
# create_client(). Clients are cached per token (each only ever carries its
# owner's token) for a short time to reuse connections.
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
        # HTTP/1.1 on purpose; see _http1_options above.
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
