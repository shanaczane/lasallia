from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.config import FRONTEND_URL
from routers import auth, books, borrow, holds, inhouse, loans, notifications, patrons, reservations, saved_books, sessions

app = FastAPI(
    title="Lasallia API",
    description="AI-Powered Smart Library System for De La Salle Lipa",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
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
app.include_router(saved_books.router)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "lasallia-api"}
