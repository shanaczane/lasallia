# Counting library assistant use (core/assistant_usage.py): one row per
# answered question with no message text or user id, and the chat keeps
# working when the count can't be saved. The SQL is covered by
# tests/db/test_assistant_usage_db.py.

import json
import uuid
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import routers.chat as chat_router
from core import assistant_usage
from core.deps import get_optional_user
from schemas.auth import UserProfile
from schemas.chat import ChatSource
from tests.fake_supabase import FakeSupabase

STUDENT = UserProfile(id="stu-1", email="stu@dlsl.edu.ph", role="student", full_name="Sample Student",
                      id_number="2026-00001")
LIBRARIAN = UserProfile(id="lib-1", email="lib@dlsl.edu.ph", role="librarian", full_name="Sample Librarian")
SECRET = "my ID number is 2026-00001"


class FailingUsageDb(FakeSupabase):
    """Every insert into assistant_usage fails, like a missing table."""

    def table(self, name):
        query = super().table(name)
        if name == "assistant_usage":
            def boom():
                raise RuntimeError('relation "assistant_usage" does not exist')
            query.execute = boom
        return query


def _client(monkeypatch, db, user=None):
    monkeypatch.setattr(chat_router, "get_admin_client", lambda: db)
    app = FastAPI()
    app.include_router(chat_router.router)
    app.dependency_overrides[get_optional_user] = lambda: user
    return TestClient(app)


def _rule_path(monkeypatch):
    source = ChatSource(kind="handbook", label="Loan Policies", detail="p. 4")
    monkeypatch.setattr(chat_router.rules, "match_and_answer", lambda message: ("fine_general", "Five pesos a day.", source))


def _ai_path(monkeypatch):
    monkeypatch.setattr(chat_router.rules, "match_and_answer", lambda message: None)
    message = SimpleNamespace(content="Here is what I found.", tool_calls=None)
    completions = SimpleNamespace(create=lambda **kwargs: SimpleNamespace(choices=[SimpleNamespace(message=message)]))
    monkeypatch.setattr(chat_router, "_get_client", lambda: SimpleNamespace(chat=SimpleNamespace(completions=completions)))


def _done(response) -> dict:
    events = [block for block in response.text.split("\n\n") if block.strip()]
    for block in events:
        if block.startswith("event: done"):
            return json.loads(block.split("data: ", 1)[1])
    raise AssertionError(f"no done event in {response.text!r}")


def _post(client, **body):
    return client.post("/chat/message", json={"message": SECRET, **body})


# ─── What's recorded ────────────────────────────────────────────────────

@pytest.mark.parametrize("path,answered_by", [(_rule_path, "rule"), (_ai_path, "ai")])
def test_each_answer_is_counted_with_no_text_or_identity(monkeypatch, path, answered_by):
    db = FakeSupabase()
    path(monkeypatch)
    session_id = str(uuid.uuid4())
    response = _post(_client(monkeypatch, db, STUDENT), session_id=session_id)
    assert response.status_code == 200
    assert _done(response)["reply"]

    rows = db.tables["assistant_usage"]
    assert len(rows) == 1
    row = {k: v for k, v in rows[0].items() if k != "id"}
    assert row == {"surface": "web", "user_type": "student", "answered_by": answered_by, "session_key": session_id}
    # Nothing the student typed or who they are.
    stored = json.dumps(rows)
    for private in (SECRET, "2026-00001", STUDENT.id, STUDENT.email, STUDENT.full_name):
        assert private not in stored


@pytest.mark.parametrize("user,expected", [
    (None, "guest"),
    (STUDENT, "student"),
    (UserProfile(id="fac-1", email="fac@dlsl.edu.ph", role="faculty"), "faculty"),
    (LIBRARIAN, "staff"),
    (UserProfile(id="g-1", email="g@example.com", role="guest"), "guest"),
])
def test_user_types(user, expected):
    assert assistant_usage.user_type(user) == expected


def test_a_guest_web_chat_gets_a_new_session_key(monkeypatch):
    db = FakeSupabase()
    _rule_path(monkeypatch)
    done = _done(_post(_client(monkeypatch, db)))
    row = db.tables["assistant_usage"][0]
    assert row["user_type"] == "guest" and row["session_key"] == done["session_id"]


def test_kiosk_questions_count_as_kiosk(monkeypatch):
    db = FakeSupabase()
    _rule_path(monkeypatch)
    _post(_client(monkeypatch, db), surface="kiosk", session_id=str(uuid.uuid4()))
    assert db.tables["assistant_usage"][0]["surface"] == "kiosk"


# ─── The chat never depends on the count ────────────────────────────────

@pytest.mark.parametrize("path,reply", [(_rule_path, "Five pesos a day."), (_ai_path, "Here is what I found.")])
def test_chat_still_answers_when_the_count_cant_be_saved(monkeypatch, path, reply):
    db = FailingUsageDb()
    path(monkeypatch)
    response = _post(_client(monkeypatch, db, STUDENT), session_id=str(uuid.uuid4()))
    assert response.status_code == 200
    assert _done(response)["reply"] == reply
    assert "event: error" not in response.text
    # The conversation itself was still saved.
    assert [m["role"] for m in db.tables["chat_messages"]] == ["user", "assistant"]
    assert not db.tables.get("assistant_usage")


def test_record_question_logs_instead_of_raising(caplog):
    assistant_usage.record_question(FailingUsageDb(), str(uuid.uuid4()), "web", None, "rule")
    assert "Could not record assistant usage" in caplog.text
