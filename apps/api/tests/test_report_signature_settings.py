# Signature job titles in Settings (migration 0060): placeholders until the
# library confirms them, editable, never blank.

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import routers.settings as settings_router
from tests.librarian_auth import allow_librarian
from core.report_export.layout import PLACEHOLDER_TITLES, placeholder_roles, signature_titles
from core.settings import _DEFAULTS
from schemas.auth import UserProfile
from tests.fake_supabase import FakeSupabase

LIBRARIAN = UserProfile(id="lib-1", email="lib@dlsl.edu.ph", role="librarian", full_name="Test Librarian")


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase(library_settings=[{"id": 1}])
    monkeypatch.setattr(settings_router, "get_admin_client", lambda: fake)
    return fake


@pytest.fixture
def client(db):
    app = FastAPI()
    app.include_router(settings_router.router)
    allow_librarian(app, LIBRARIAN)
    return TestClient(app)


def test_defaults_are_the_placeholders_in_one_place():
    # core/settings.py, the migration's column defaults and layout.py agree.
    assert {k: _DEFAULTS[f"report_{k}_title"] for k in PLACEHOLDER_TITLES} == PLACEHOLDER_TITLES
    migration = open("migrations/0060_report_signatures.sql", encoding="utf-8").read()
    for title in PLACEHOLDER_TITLES.values():
        assert f"default '{title}'" in migration


def test_settings_return_the_placeholder_titles(client):
    body = client.get("/settings").json()
    assert body["report_prepared_by_title"] == "Librarian"
    assert body["report_noted_by_title"] == "Head Librarian"
    assert body["report_approved_by_title"] == "Director, Learning Resource Center"
    assert placeholder_roles(body) == ["Prepared by", "Noted by", "Approved by"]


def test_a_title_can_be_changed_and_is_trimmed(client, db):
    res = client.patch("/settings", json={"report_noted_by_title": "  Chief Librarian  "})
    assert res.status_code == 200, res.text
    assert res.json()["report_noted_by_title"] == "Chief Librarian"
    assert placeholder_roles(res.json()) == ["Prepared by", "Approved by"]
    assert signature_titles(res.json())["noted_by"] == "Chief Librarian"


@pytest.mark.parametrize("value, code", [("   ", 400), ("", 422), (None, 400), ("x" * 121, 422)])
def test_a_title_cant_be_blank_or_too_long(client, value, code):
    assert client.patch("/settings", json={"report_approved_by_title": value}).status_code == code
