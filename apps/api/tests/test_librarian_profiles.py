# Librarian profiles: signing in by PIN or tap, the lock after 5 failures,
# the active-profile token and Manage Librarians. The database is faked
# (tests/fake_supabase.py).

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi import FastAPI
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

import core.deps as deps
import core.librarian_profiles as profiles_core
import routers.librarian_profiles as profiles_router
from core.deps import PROFILE_REQUIRED, get_current_user, require_librarian, require_librarian_profile
from core.librarian_profiles import LOCK_SECONDS, MAX_FAILED_ATTEMPTS, hash_pin, issue_token
from schemas.auth import UserProfile
from tests.fake_supabase import FakeSupabase

SECRET = "test-secret-that-is-long-enough-for-hs256"
ACCOUNT = UserProfile(id="shared-account", email="lrc@dlsl.edu.ph", role="librarian", full_name="LRC")
PIN = "2468"
# Hashed once: bcrypt is deliberately slow.
PIN_HASH = hash_pin(PIN)


def _profile(**overrides) -> dict:
    row = {
        "id": "p-ana", "full_name": "Ana Reyes", "pin_hash": PIN_HASH, "staff_rfid_uid": "CARD-ANA",
        "is_active": True, "failed_attempts": 0, "locked_until": None,
        "created_at": "2026-01-01T00:00:00+00:00",
    }
    row.update(overrides)
    return row


def _record_failure(db):
    def handler(params):
        row = next(r for r in db.tables["librarian_profiles"] if r["id"] == params["p_profile_id"])
        row["failed_attempts"] += 1
        if row["failed_attempts"] >= params["p_max_attempts"]:
            row["failed_attempts"] = 0
            row["locked_until"] = (datetime.now(timezone.utc) + timedelta(seconds=params["p_lock_seconds"])).isoformat()
        return {"failed_attempts": row["failed_attempts"], "locked_until": row["locked_until"]}
    return handler


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase(librarian_profiles=[_profile(), _profile(id="p-ben", full_name="Ben Cruz", staff_rfid_uid=None)])
    fake.rpc_handlers["record_librarian_sign_in_failure"] = _record_failure(fake)
    fake.column_defaults["librarian_profiles"] = {
        "is_active": True, "staff_rfid_uid": None, "failed_attempts": 0, "locked_until": None,
        "created_at": "2026-06-01T00:00:00+00:00",
    }
    monkeypatch.setattr(profiles_router, "get_admin_client", lambda: fake)
    monkeypatch.setattr(deps, "get_admin_client", lambda: fake)
    monkeypatch.setattr(profiles_core, "LIBRARIAN_PROFILE_SECRET", SECRET)
    return fake


@pytest.fixture
def client(db):
    app = FastAPI()
    app.include_router(profiles_router.router)
    app.dependency_overrides[get_current_user] = lambda: ACCOUNT
    return TestClient(app)


def _sign_in(client, profile_id="p-ana", **body):
    return client.post(f"/librarian-profiles/{profile_id}/sign-in", json=body)


def _session_header(client, profile_id="p-ana") -> dict:
    token = _sign_in(client, profile_id, pin=PIN).json()["token"]
    return {"X-Librarian-Profile": token}


# ── signing in ──

def test_the_picker_lists_active_profiles_without_secrets(client, db):
    db.tables["librarian_profiles"].append(_profile(id="p-old", full_name="Old Staff", is_active=False, staff_rfid_uid="X"))
    body = client.get("/librarian-profiles/active").json()
    assert sorted(p["full_name"] for p in body) == ["Ana Reyes", "Ben Cruz"]
    assert all(set(p) == {"id", "full_name", "locked_seconds"} for p in body)


def test_the_right_pin_signs_in_and_never_comes_back(client):
    res = _sign_in(client, pin=PIN)
    assert res.status_code == 200
    body = res.json()
    assert body["full_name"] == "Ana Reyes"
    assert body["idle_timeout_minutes"] == 15
    assert PIN not in res.text and "pin_hash" not in res.text


def test_tapping_the_profiles_own_card_signs_in(client):
    assert _sign_in(client, rfid_uid=" CARD-ANA\n").status_code == 200


def test_another_librarians_card_does_not_sign_in(client, db):
    db.tables["librarian_profiles"][1]["staff_rfid_uid"] = "CARD-BEN"
    assert _sign_in(client, rfid_uid="CARD-BEN").status_code == 401


def test_a_profile_with_no_card_cant_be_tapped_into(client):
    assert _sign_in(client, "p-ben", rfid_uid="ANYTHING").status_code == 401


@pytest.mark.parametrize("body", [{}, {"pin": PIN, "rfid_uid": "CARD-ANA"}, {"rfid_uid": "   "}])
def test_sign_in_needs_exactly_one_method(client, body):
    assert _sign_in(client, **body).status_code == 400


@pytest.mark.parametrize("pin", ["123", "1234567", "12a4"])
def test_a_badly_formed_pin_is_refused(client, pin):
    assert _sign_in(client, pin=pin).status_code == 422


def test_a_disabled_profile_cant_sign_in(client, db):
    db.tables["librarian_profiles"][0]["is_active"] = False
    assert _sign_in(client, pin=PIN).status_code == 403


# ── the lock ──

def test_the_fifth_wrong_pin_locks_the_profile_for_five_minutes(client, db):
    for attempt in range(1, MAX_FAILED_ATTEMPTS):
        res = _sign_in(client, pin="0000")
        assert res.status_code == 401
        assert f"{MAX_FAILED_ATTEMPTS - attempt} attempt" in res.json()["detail"]

    assert _sign_in(client, pin="0000").status_code == 423
    locked_until = datetime.fromisoformat(db.tables["librarian_profiles"][0]["locked_until"])
    left = (locked_until - datetime.now(timezone.utc)).total_seconds()
    assert LOCK_SECONDS - 5 < left <= LOCK_SECONDS == 300


def test_a_locked_profile_cant_sign_in_even_with_the_right_pin_or_card(client, db):
    db.tables["librarian_profiles"][0]["locked_until"] = (datetime.now(timezone.utc) + timedelta(minutes=3)).isoformat()
    assert _sign_in(client, pin=PIN).status_code == 423
    assert _sign_in(client, rfid_uid="CARD-ANA").status_code == 423


def test_wrong_taps_count_toward_the_lock(client):
    for _ in range(MAX_FAILED_ATTEMPTS - 1):
        assert _sign_in(client, rfid_uid="GUESS").status_code == 401
    assert _sign_in(client, rfid_uid="GUESS").status_code == 423


def test_locking_one_profile_leaves_the_others_alone(client):
    for _ in range(MAX_FAILED_ATTEMPTS):
        _sign_in(client, pin="0000")
    assert _sign_in(client, "p-ben", pin=PIN).status_code == 200


def test_a_lock_runs_out(client, db):
    db.tables["librarian_profiles"][0]["locked_until"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    assert _sign_in(client, pin=PIN).status_code == 200


def test_signing_in_clears_earlier_failures(client, db):
    _sign_in(client, pin="0000")
    _sign_in(client, pin=PIN)
    assert db.tables["librarian_profiles"][0]["failed_attempts"] == 0


# ── the active-profile token ──

def test_a_write_without_a_token_is_refused(client):
    res = client.post("/librarian-profiles", json={"full_name": "New", "pin": PIN})
    assert res.status_code == 403
    assert res.json()["detail"] == PROFILE_REQUIRED


def _is_refused(client, token: str) -> bool:
    res = client.post("/librarian-profiles/session/renew", headers={"X-Librarian-Profile": token})
    return res.status_code == 403 and res.json()["detail"] == PROFILE_REQUIRED


def test_a_forged_token_is_refused(client):
    forged = jwt.encode(
        {"sub": "p-ana", "acct": ACCOUNT.id, "aud": "librarian-profile",
         "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
        "x" * 40, algorithm="HS256",
    )
    assert _is_refused(client, forged)


def test_an_expired_token_is_refused(client, db):
    token, _ = issue_token(db.tables["librarian_profiles"][0], ACCOUNT.id, idle_minutes=-1)
    assert _is_refused(client, token)


def test_a_token_from_another_account_is_refused(client, db):
    token, _ = issue_token(db.tables["librarian_profiles"][0], "some-other-account", idle_minutes=15)
    assert _is_refused(client, token)


def test_disabling_a_profile_ends_its_session_at_once(client, db):
    header = _session_header(client)
    db.tables["librarian_profiles"][0]["is_active"] = False
    assert _is_refused(client, header["X-Librarian-Profile"])


def test_the_token_lasts_as_long_as_the_idle_setting(client, db):
    db.tables["library_settings"] = [{"id": 1, "librarian_idle_timeout_minutes": 30}]
    body = _sign_in(client, pin=PIN).json()
    assert body["idle_timeout_minutes"] == 30
    left = (datetime.fromisoformat(body["expires_at"]) - datetime.now(timezone.utc)).total_seconds()
    assert 29 * 60 < left <= 30 * 60


def test_renewing_gives_a_working_token_for_the_same_profile(client):
    res = client.post("/librarian-profiles/session/renew", headers=_session_header(client))
    assert res.status_code == 200
    assert res.json()["profile_id"] == "p-ana"
    assert not _is_refused(client, res.json()["token"])


def test_without_the_server_secret_writes_are_refused(client, monkeypatch):
    header = _session_header(client)
    monkeypatch.setattr(profiles_core, "LIBRARIAN_PROFILE_SECRET", "")
    assert client.post("/librarian-profiles/session/renew", headers=header).status_code == 503


# ── Manage Librarians ──

def test_adding_a_profile_stores_only_a_hash(client, db):
    res = client.post("/librarian-profiles", headers=_session_header(client), json={"full_name": " Carla Santos ", "pin": "135790"})
    assert res.status_code == 201
    assert "pin" not in res.text
    row = next(r for r in db.tables["librarian_profiles"] if r["full_name"] == "Carla Santos")
    assert row["pin_hash"].startswith("$2") and "135790" not in row["pin_hash"]


def test_a_duplicate_name_is_refused(client):
    res = client.post("/librarian-profiles", headers=_session_header(client), json={"full_name": "ana reyes", "pin": PIN})
    assert res.status_code == 409


def test_the_managed_list_never_includes_the_card_id_or_hash(client):
    res = client.get("/librarian-profiles", headers=_session_header(client))
    assert res.status_code == 200
    assert "CARD-ANA" not in res.text and "pin_hash" not in res.text
    assert {p["full_name"]: p["has_staff_card"] for p in res.json()} == {"Ana Reyes": True, "Ben Cruz": False}


def test_nobody_can_disable_their_own_profile(client, db):
    res = client.patch("/librarian-profiles/p-ana", headers=_session_header(client), json={"is_active": False})
    assert res.status_code == 400
    assert db.tables["librarian_profiles"][0]["is_active"] is True


def test_a_librarian_can_disable_and_enable_another_profile(client, db):
    header = _session_header(client)
    assert client.patch("/librarian-profiles/p-ben", headers=header, json={"is_active": False}).json()["is_active"] is False
    assert client.patch("/librarian-profiles/p-ben", headers=header, json={"is_active": True}).json()["is_active"] is True


def test_resetting_a_pin_replaces_it_and_clears_the_lock(client, db):
    header = _session_header(client)
    ben = db.tables["librarian_profiles"][1]
    ben["locked_until"] = (datetime.now(timezone.utc) + timedelta(minutes=3)).isoformat()
    assert client.post("/librarian-profiles/p-ben/reset-pin", headers=header, json={"pin": "97531"}).status_code == 204
    assert ben["locked_until"] is None
    assert _sign_in(client, "p-ben", pin=PIN).status_code == 401
    assert _sign_in(client, "p-ben", pin="97531").status_code == 200


def test_a_staff_card_links_to_one_librarian_only(client):
    header = _session_header(client)
    assert client.put("/librarian-profiles/p-ben/staff-card", headers=header, json={"rfid_uid": "CARD-ANA"}).status_code == 409
    res = client.put("/librarian-profiles/p-ben/staff-card", headers=header, json={"rfid_uid": " CARD-BEN "})
    assert res.status_code == 200 and res.json()["has_staff_card"] is True
    assert _sign_in(client, "p-ben", rfid_uid="CARD-BEN").status_code == 200


def test_a_staff_card_can_be_unlinked(client):
    header = _session_header(client)
    assert client.delete("/librarian-profiles/p-ana/staff-card", headers=header).json()["has_staff_card"] is False


# ── every write is covered ──

# Librarian routes that change nothing, though they aren't GETs (or that
# start the sign-in itself).
READ_ONLY_POSTS = {
    ("POST", "/desk/identify"),                        # POST keeps the card id out of URLs
    ("POST", "/reports/export/preview"),
    ("POST", "/reports/export/ai-summary"),
    ("POST", "/librarian-profiles/{profile_id}/sign-in"),
}
# Reads that count as writes: exports leave the system.
GETS_NEEDING_A_PROFILE = {
    ("GET", "/sync/export-new-copies"),
    ("GET", "/librarian-profiles"),
}


def _uses(route: APIRoute, dependency) -> bool:
    stack = list(route.dependant.dependencies)
    while stack:
        dep = stack.pop()
        if dep.call is dependency:
            return True
        stack.extend(dep.dependencies)
    return False


def test_every_librarian_write_route_needs_an_active_profile():
    from main import app

    missing = []
    for route in app.routes:
        if not isinstance(route, APIRoute) or not _uses(route, require_librarian):
            continue
        for method in route.methods - {"HEAD", "OPTIONS"}:
            key = (method, route.path)
            must_have = (method != "GET" and key not in READ_ONLY_POSTS) or key in GETS_NEEDING_A_PROFILE
            if must_have and not _uses(route, require_librarian_profile):
                missing.append(key)
    assert missing == []
