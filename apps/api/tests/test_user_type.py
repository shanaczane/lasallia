# The user type reaches the kiosk and the desk: the session after a tap, the
# desk's ID tap, and a loan lookup by scan or search.

from fastapi.testclient import TestClient

import routers.desk as desk_router
import routers.sessions as sessions_router
from core.deps import require_librarian
from core.desk import LOAN_BORROWER
from main import app
from schemas.auth import UserProfile
from schemas.loan import Loan
from tests.fake_supabase import FakeSupabase

STUDENT = {
    "id": "s1", "full_name": "Ana Reyes", "role": "student", "rfid_uid": "CARD-S",
    "program": "BSCS", "college": "CITE", "year_level": 3, "avatar_url": None,
}
FACULTY = {
    "id": "f1", "full_name": "Ben Cruz", "role": "faculty", "rfid_uid": "CARD-F",
    "program": None, "college": "CEAS", "year_level": None, "avatar_url": None,
}
GUEST = {"id": "g1", "full_name": "Cy Dee", "role": "guest", "rfid_uid": "CARD-G"}


def _db() -> FakeSupabase:
    db = FakeSupabase(
        profiles=[dict(STUDENT), dict(FACULTY), dict(GUEST)],
        station_sessions=[], loans=[], reservations=[], library_settings=[],
    )
    db.column_defaults["station_sessions"] = {"started_at": "2026-11-07T01:00:00+00:00", "ended_at": None}
    return db


def _tap(monkeypatch, card: str):
    monkeypatch.setattr(sessions_router, "get_admin_client", _db)
    return TestClient(app).post("/station-sessions", json={
        "auth_method": "rfid", "rfid_uid": card, "station_id": "kiosk-1",
    })


def test_a_student_tap_returns_their_user_type_and_details(monkeypatch):
    body = _tap(monkeypatch, "CARD-S").json()
    assert (body["role"], body["college"], body["year_level"]) == ("student", "CITE", 3)
    assert body["student_full_name"] == "Ana Reyes"


def test_a_faculty_tap_returns_faculty(monkeypatch):
    assert _tap(monkeypatch, "CARD-F").json()["role"] == "faculty"


def test_guests_still_cant_open_a_kiosk_session(monkeypatch):
    assert _tap(monkeypatch, "CARD-G").status_code == 403


def test_the_desk_tap_returns_the_details_for_the_badge(monkeypatch):
    monkeypatch.setattr(desk_router, "get_admin_client", _db)
    app.dependency_overrides[require_librarian] = lambda: UserProfile(id="l1", email="l@dlsl.edu.ph", role="librarian")
    try:
        body = TestClient(app).post("/desk/identify", json={"rfid_uid": "CARD-S"}).json()
    finally:
        app.dependency_overrides.clear()
    assert (body["role"], body["college"], body["year_level"]) == ("student", "CITE", 3)


def test_every_loan_lookup_asks_for_the_details_for_the_badge():
    for column in ("role", "program", "college", "year_level"):
        assert column in LOAN_BORROWER


def test_a_loan_keeps_the_borrowers_user_type():
    loan = Loan(
        id="l1", book_copy_id="c1", student_id="s1", borrowed_at="2026-11-01T00:00:00+00:00",
        due_date="2026-11-08T00:00:00+00:00", status="active", condition_at_borrow="good",
        profiles={"full_name": "Ben Cruz", "role": "faculty", "college": "CEAS"},
    )
    assert loan.profiles.role == "faculty"
