# Someone who scans another student's borrow QR code: they're turned away,
# and however often they try, the borrower's hold is left alone.

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import core.holds as holds_core
import routers.holds as holds_router
from core.deps import get_current_user, get_optional_user
from main import app as real_app
from schemas.auth import UserProfile
from tests.fake_supabase import FakeSupabase

TOKEN = "borrow-token"
BORROWER = UserProfile(id="student-1", email="ana@dlsl.edu.ph", role="student")
STRANGER = UserProfile(id="student-2", email="ben@dlsl.edu.ph", role="student")


@pytest.fixture
def db():
    expires = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
    return FakeSupabase(
        soft_holds=[{
            "id": "hold-1", "token": TOKEN, "book_copy_id": "copy-1", "station_session_id": "session-1",
            "attempt_count": 0, "expires_at": expires, "created_at": datetime.now(timezone.utc).isoformat(),
            "verified_at": None,
        }],
        station_sessions=[{"id": "session-1", "student_id": BORROWER.id, "auth_method": "rfid", "ended_at": None}],
        book_copies=[{"id": "copy-1", "book_id": "book-1", "accession_number": "T45136", "status": "available"}],
    )


@pytest.fixture
def client(db, monkeypatch):
    monkeypatch.setattr(holds_router, "get_admin_client", lambda: db)
    monkeypatch.setattr(holds_core, "notify_librarians", lambda *a, **k: None)
    monkeypatch.setattr(holds_router, "notify_librarians", lambda *a, **k: None)
    real_app.dependency_overrides[get_current_user] = lambda: STRANGER
    real_app.dependency_overrides[get_optional_user] = lambda: STRANGER
    try:
        yield TestClient(real_app)
    finally:
        real_app.dependency_overrides.clear()


def test_another_account_cannot_open_the_borrow_form(client):
    res = client.get(f"/holds/{TOKEN}")
    assert res.status_code == 403
    assert "another account" in res.json()["detail"]


@pytest.mark.parametrize("method, path, body", [
    ("get", f"/holds/{TOKEN}", None),
    ("get", f"/holds/{TOKEN}/status", None),
    ("post", f"/holds/{TOKEN}/verify", {"accession_number": "T45136", "condition": "good"}),
    ("post", f"/holds/{TOKEN}/extend", None),
    ("post", f"/holds/{TOKEN}/report-missing", None),
    ("post", f"/holds/{TOKEN}/release", None),
])
def test_another_account_is_refused_everywhere(client, method, path, body):
    res = client.request(method.upper(), path, json=body)
    assert res.status_code == 403


def test_repeated_stray_scans_leave_the_borrow_alone(client, db):
    for _ in range(holds_core.MAX_ATTEMPTS + 2):
        assert client.get(f"/holds/{TOKEN}").status_code == 403

    # Still there, with no wrong attempts counted against the borrower.
    assert [h["attempt_count"] for h in db.tables["soft_holds"]] == [0]
    assert db.tables["book_copies"][0]["status"] == "available"
