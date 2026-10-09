from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from core.config import FRONTEND_URL, FRONTEND_ORIGIN_REGEX
from routers import auth, book_requests, books, borrow, chat, holds, inhouse, loans, notifications, patrons, recommendations, reports, reservations, saved_books, search, sessions, settings, support_tickets, weeding

app = FastAPI(
    title="Lasallia API",
    description="AI-Powered Smart Library System for DLSL",
    version="1.0.0",
)


# Add the www/non-www twin of each origin, so both work the same.
def _www_variant(origin: str) -> str | None:
    if "://www." in origin:
        return origin.replace("://www.", "://", 1)
    scheme, _, rest = origin.partition("://")
    if not rest or rest.startswith("localhost"):
        return None
    return f"{scheme}://www.{rest}"

# lasallia.vercel.app is the project's raw Vercel URL — also allowed.
_configured_origins = [FRONTEND_URL, "https://dev.lasallia.com", "https://lasallia.vercel.app", "http://localhost:3000"]
_allow_origins = list(dict.fromkeys(
    _configured_origins + [v for o in _configured_origins if (v := _www_variant(o))]
))

# The catalog list is ~45 KB gzipped vs ~200 KB raw; compress anything sizeable.
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_origin_regex=FRONTEND_ORIGIN_REGEX or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(books.router)
app.include_router(borrow.router)
app.include_router(reservations.router)
app.include_router(sessions.router)
app.include_router(holds.router)
app.include_router(loans.router)
app.include_router(inhouse.router)
app.include_router(notifications.router)
app.include_router(patrons.router)
app.include_router(recommendations.router)
app.include_router(reports.router)
app.include_router(saved_books.router)
app.include_router(search.router)
app.include_router(chat.router)
app.include_router(weeding.router)
app.include_router(settings.router)
app.include_router(support_tickets.router)
app.include_router(book_requests.router)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "lasallia-api"}
