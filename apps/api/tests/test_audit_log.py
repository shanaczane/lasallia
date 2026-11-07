# The audit log: what gets recorded, that a logging failure never blocks the
# action, and the page and export. The database is faked; the append-only
# rules are in tests/db/test_audit_log_db.py.

import csv
import io
import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import routers.audit as audit_router
import routers.librarian_profiles as profiles_router
import routers.reports as reports_router
import routers.settings as settings_router
from core.audit import ACTIONS, changed_fields, log_action
from core.deps import get_current_user
from core.librarian_profiles import hash_pin
from core.report_export.definitions import ExportFilters, build_audit_log
from schemas.auth import UserProfile
from tests.fake_supabase import FakeSupabase
from tests.librarian_auth import active_librarian, allow_librarian

LIBRARIAN = UserProfile(id="shared", email="lrc@dlsl.edu.ph", role="librarian", full_name="LRC")
ACTIVE = active_librarian(LIBRARIAN, "p-ana", "Ana Reyes")


def _entry(**overrides) -> dict:
    row = {
        "id": "a1", "librarian_profile_id": "p-ana", "librarian_name": "Ana Reyes", "action": "loan.return",
        "entity_type": "loan", "entity_id": "loan-1", "details": {"returned_verified_by": "id_tap"},
        "created_at": "2026-11-05T02:30:00+00:00",
    }
    row.update(overrides)
    return row


class _BrokenInsert(FakeSupabase):
    def table(self, name):
        if name == "audit_log":
            raise RuntimeError("database is down")
        return super().table(name)


def test_log_action_records_who_did_what():
    db = FakeSupabase()
    log_action(db, ACTIVE, "loan.return", "loan", "loan-1", {"returned_verified_by": "manual"})
    row = db.tables["audit_log"][0]
    assert row["librarian_profile_id"] == "p-ana"
    assert row["librarian_name"] == "Ana Reyes"
    assert row["action"] == "loan.return"
    assert row["entity_id"] == "loan-1"
    assert row["details"] == {"returned_verified_by": "manual"}


def test_a_logging_failure_doesnt_raise_but_reaches_the_server_log(caplog):
    with caplog.at_level(logging.ERROR, logger="lasallia.audit"):
        log_action(_BrokenInsert(), ACTIVE, "loan.return", "loan", "loan-1")
    assert "Audit log write failed" in caplog.text
    assert "loan.return" in caplog.text


def test_changed_fields_lists_only_what_changed():
    assert changed_fields({"a": 1, "b": 2}, {"a": 1, "b": 3}) == {"b": {"from": 2, "to": 3}}


# ── recorded through the real routes ──

@pytest.fixture
def profiles_client(monkeypatch):
    db = FakeSupabase(librarian_profiles=[
        {"id": "p-ben", "full_name": "Ben Cruz", "pin_hash": hash_pin("1234"), "staff_rfid_uid": None, "is_active": True,
         "locked_until": None, "created_at": "2026-01-01T00:00:00+00:00"},
    ])
    monkeypatch.setattr(profiles_router, "get_admin_client", lambda: db)
    app = FastAPI()
    app.include_router(profiles_router.router)
    allow_librarian(app, LIBRARIAN)
    return TestClient(app), db


def _actions(db) -> list[str]:
    return [row["action"] for row in db.tables.get("audit_log", [])]


def test_every_profile_change_is_audited_without_secrets(profiles_client):
    client, db = profiles_client
    assert client.post("/librarian-profiles/p-ben/reset-pin", json={"pin": "9753"}).status_code == 204
    assert client.put("/librarian-profiles/p-ben/staff-card", json={"rfid_uid": "abcd1234"}).status_code == 200
    assert client.delete("/librarian-profiles/p-ben/staff-card").status_code == 200
    assert client.patch("/librarian-profiles/p-ben", json={"is_active": False}).status_code == 200
    assert client.patch("/librarian-profiles/p-ben", json={"is_active": True}).status_code == 200
    assert client.patch("/librarian-profiles/p-ben", json={"full_name": "Benjamin Cruz"}).status_code == 200

    assert _actions(db) == [
        "librarian_profile.reset_pin", "librarian_profile.link_card", "librarian_profile.unlink_card",
        "librarian_profile.disable", "librarian_profile.enable", "librarian_profile.update",
    ]
    assert db.tables["audit_log"][0]["librarian_name"] == "Test Profile"
    text = str(db.tables["audit_log"])
    assert "9753" not in text and "abcd1234" not in text


def test_a_settings_change_records_old_and_new_values(monkeypatch):
    db = FakeSupabase(library_settings=[{"id": 1, "max_renewals": 2}])
    monkeypatch.setattr(settings_router, "get_admin_client", lambda: db)
    app = FastAPI()
    app.include_router(settings_router.router)
    allow_librarian(app, LIBRARIAN)
    assert TestClient(app).patch("/settings", json={"max_renewals": 3}).status_code == 200
    assert db.tables["audit_log"][0]["details"]["changed"]["max_renewals"] == {"from": 2, "to": 3}


def test_every_logged_action_has_a_label():
    # The strings passed to log_action across the routers.
    import re
    from pathlib import Path

    routers = Path(__file__).resolve().parents[1] / "routers"
    used = set()
    for path in routers.glob("*.py"):
        text = path.read_text(encoding="utf-8")
        used |= set(re.findall(r'log_action\(\s*[^,]+,\s*[^,]+,\s*"([^"]+)"', text))
    assert used and used <= set(ACTIONS)


# ── the page ──

@pytest.fixture
def page(monkeypatch):
    db = FakeSupabase(
        audit_log=[
            _entry(id=f"a{i}", action="loan.return" if i % 2 else "fine.payment",
                   librarian_profile_id="p-ana" if i < 25 else "p-ben",
                   created_at=f"2026-11-{5 + i % 3:02d}T02:30:00+00:00")
            for i in range(30)
        ],
        librarian_profiles=[{"id": "p-ana", "full_name": "Ana Reyes"}, {"id": "p-ben", "full_name": "Ben Cruz"}],
    )
    monkeypatch.setattr(audit_router, "get_admin_client", lambda: db)
    app = FastAPI()
    app.include_router(audit_router.router)
    allow_librarian(app, LIBRARIAN)
    return TestClient(app)


def test_the_log_is_paged_with_a_total(page):
    body = page.get("/audit-log", params={"page": 2, "page_size": 25}).json()
    assert len(body["items"]) == 5
    assert body["total"] == 30


def test_filters_narrow_the_log(page):
    assert page.get("/audit-log", params={"librarian_profile_id": "p-ben"}).json()["total"] == 5
    assert page.get("/audit-log", params={"action": "fine.payment"}).json()["total"] == 15
    # 5 Nov in Manila only.
    assert page.get("/audit-log", params={"date_from": "2026-11-05", "date_to": "2026-11-05"}).json()["total"] == 10


def test_entries_carry_a_readable_action_label(page):
    item = page.get("/audit-log", params={"action": "fine.payment"}).json()["items"][0]
    assert item["action_label"] == "Fine payment"


def test_a_backwards_date_range_is_refused(page):
    assert page.get("/audit-log", params={"date_from": "2026-11-06", "date_to": "2026-11-05"}).status_code == 400


def test_the_filters_offer_every_librarian_and_action(page):
    body = page.get("/audit-log/options").json()
    assert [l["full_name"] for l in body["librarians"]] == ["Ana Reyes", "Ben Cruz"]
    assert {a["value"] for a in body["actions"]} == set(ACTIONS)


@pytest.mark.parametrize("role", ["student", "faculty", "guest"])
def test_only_librarians_can_read_the_log(monkeypatch, role):
    app = FastAPI()
    app.include_router(audit_router.router)
    app.dependency_overrides[get_current_user] = lambda: UserProfile(id="u", email="u@dlsl.edu.ph", role=role)
    assert TestClient(app).get("/audit-log").status_code == 403


# ── the export ──

def test_the_report_shows_manila_time_and_readable_details():
    db = FakeSupabase(audit_log=[_entry(
        created_at="2026-11-05T17:30:00+00:00",
        action="book.update",
        details={"changed": {"title": {"from": "Old", "to": "New"}}, "reason": "Typo"},
    )])
    data = build_audit_log(db, ExportFilters())
    row = data.rows[0]
    assert row["created_at"] == "November 6, 2026, 1:30 AM"
    assert row["action"] == "Book edited"
    assert row["details"] == "title: Old → New; reason: Typo"


def test_the_report_only_sends_counts_to_the_ai():
    db = FakeSupabase(audit_log=[_entry(), _entry(id="a2", action="fine.payment")])
    data = build_audit_log(db, ExportFilters())
    assert data.ai_payload["actions_recorded"] == 2
    assert "Ana Reyes" not in str(data.ai_payload)
    assert "loan-1" not in str(data.ai_payload)


def test_an_empty_report_says_so():
    data = build_audit_log(FakeSupabase(audit_log=[]), ExportFilters())
    assert data.rows == [] and data.chart is None
    assert "No librarian actions" in data.computed_summary


def test_exporting_the_audit_log_is_itself_audited(monkeypatch):
    db = FakeSupabase(audit_log=[_entry()], library_settings=[])
    monkeypatch.setattr(reports_router, "get_admin_client", lambda: db)
    app = FastAPI()
    app.include_router(reports_router.router)
    allow_librarian(app, LIBRARIAN)
    res = TestClient(app).post("/reports/export", json={"report": "audit_log", "format": "csv"})
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(res.content.decode("utf-8-sig"))))
    assert rows[0] == ["Date and time", "Librarian", "Action", "Record", "Details"]
    assert rows[1][1] == "Ana Reyes"
    assert db.tables["audit_log"][-1]["action"] == "report.export"
    assert db.tables["audit_log"][-1]["entity_id"] == "audit_log"
