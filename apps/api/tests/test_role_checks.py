# Who can reach what, through the real app's routes. The database is faked.
# fake_supabase can't run RLS, so the data tests here prove each route reads
# through the caller's own client, not the admin one; tests/db/test_rls_db.py
# runs the real policies.

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

import core.deps as deps
import core.librarian_profiles as profiles_core
import routers.chat as chat_router
import routers.loans as loans_router
import routers.notifications as notifications_router
import routers.reservations as reservations_router
from core.deps import (
    PROFILE_REQUIRED,
    get_current_user,
    get_user_supabase,
    require_librarian,
    require_librarian_profile,
    require_profile_if_librarian,
)
from core.librarian_profiles import issue_token
from main import app
from schemas.auth import UserProfile
from tests.fake_supabase import FakeSupabase

AUTH = {"Authorization": "Bearer test-token"}


def _user(role: str, user_id: str = "u1") -> UserProfile:
    return UserProfile(id=user_id, email=f"{user_id}@dlsl.edu.ph", role=role)


@pytest.fixture
def as_user():
    def sign_in(user: UserProfile) -> TestClient:
        app.dependency_overrides[get_current_user] = lambda: user
        return TestClient(app, raise_server_exceptions=False)

    yield sign_in
    app.dependency_overrides.clear()


def _uses(route: APIRoute, dependency) -> bool:
    stack = list(route.dependant.dependencies)
    while stack:
        dep = stack.pop()
        if dep.call is dependency:
            return True
        stack.extend(dep.dependencies)
    return False


def _routes(dependency) -> list[tuple[str, str]]:
    found = []
    for route in app.routes:
        if isinstance(route, APIRoute) and _uses(route, dependency):
            path = route.path.replace("{", "").replace("}", "")  # any value fills a path parameter
            found.extend((method, path) for method in route.methods - {"HEAD", "OPTIONS"})
    return sorted(found)


LIBRARIAN_ROUTES = _routes(require_librarian)
PROFILE_ROUTES = _routes(require_librarian_profile)


def test_the_route_lists_are_not_empty():
    assert len(LIBRARIAN_ROUTES) > 70
    assert len(PROFILE_ROUTES) > 30


@pytest.mark.parametrize("role", ["student", "faculty", "guest"])
@pytest.mark.parametrize("method, path", LIBRARIAN_ROUTES)
def test_other_roles_get_403_on_every_librarian_route(as_user, role, method, path):
    res = as_user(_user(role)).request(method, path, headers=AUTH, json={})
    assert res.status_code == 403
    assert res.json()["detail"] == "Insufficient permissions"


@pytest.mark.parametrize("method, path", LIBRARIAN_ROUTES)
def test_no_token_gets_401_or_403_on_every_librarian_route(method, path):
    res = TestClient(app, raise_server_exceptions=False).request(method, path, json={})
    assert res.status_code in (401, 403)


@pytest.mark.parametrize("method, path", PROFILE_ROUTES)
def test_librarian_writes_need_an_active_profile(as_user, method, path):
    res = as_user(_user("librarian")).request(method, path, headers=AUTH, json={})
    assert res.status_code == 403
    assert res.json()["detail"] == PROFILE_REQUIRED


@pytest.mark.parametrize("method, path", PROFILE_ROUTES)
def test_a_bad_profile_token_is_refused_on_librarian_writes(as_user, monkeypatch, method, path):
    monkeypatch.setattr(profiles_core, "LIBRARIAN_PROFILE_SECRET", "s" * 40)
    client = as_user(_user("librarian"))
    res = client.request(method, path, headers={**AUTH, "X-Librarian-Profile": "not-a-token"}, json={})
    assert res.status_code == 403


def test_a_librarian_cancelling_a_reservation_needs_an_active_profile(as_user):
    res = as_user(_user("librarian")).patch("/reservations/r1", headers=AUTH, json={"status": "cancelled"})
    assert res.status_code == 403
    assert res.json()["detail"] == PROFILE_REQUIRED


def test_opening_an_assisted_session_needs_an_active_profile(monkeypatch):
    monkeypatch.setattr(deps, "get_current_user", lambda _credentials: _user("librarian"))
    res = TestClient(app).post("/station-sessions", headers=AUTH, json={
        "auth_method": "librarian_assisted", "student_id": "s1", "station_id": "desk",
    })
    assert res.status_code == 403
    assert res.json()["detail"] == PROFILE_REQUIRED


def test_a_student_cant_open_an_assisted_session(monkeypatch):
    monkeypatch.setattr(deps, "get_current_user", lambda _credentials: _user("student"))
    res = TestClient(app).post("/station-sessions", headers=AUTH, json={
        "auth_method": "librarian_assisted", "student_id": "s1", "station_id": "desk",
    })
    assert res.status_code == 403
    assert res.json()["detail"] == "Only a librarian can open an assisted session"


def test_a_profile_token_changes_nothing_for_a_student(monkeypatch):
    # Students on a shared route never need one.
    student = _user("student")
    assert require_profile_if_librarian(student, None) is student


def test_a_valid_token_lets_a_librarian_through_on_a_shared_route(monkeypatch):
    monkeypatch.setattr(profiles_core, "LIBRARIAN_PROFILE_SECRET", "s" * 40)
    db = FakeSupabase(librarian_profiles=[{"id": "p1", "full_name": "Ana", "is_active": True}])
    monkeypatch.setattr(deps, "get_admin_client", lambda: db)
    librarian = _user("librarian")
    token, _ = issue_token({"id": "p1"}, librarian.id, 15)
    assert require_profile_if_librarian(librarian, token).librarian_name == "Ana"


# ── the role comes from the profiles table ──

class _Credentials:
    credentials = "token"


def _current_user_with(monkeypatch, profile_rows: list[dict], metadata: dict) -> UserProfile:
    monkeypatch.setattr(deps, "get_admin_client", lambda: FakeSupabase(profiles=profile_rows))
    monkeypatch.setattr(deps, "_decode_token", lambda _token: {"sub": "u1", "email": "u@x", "user_metadata": metadata})
    return get_current_user(_Credentials())


def test_a_role_in_user_metadata_is_never_trusted(monkeypatch):
    # Users can edit their own metadata through Supabase Auth.
    assert _current_user_with(monkeypatch, [], {"role": "librarian"}).role == "guest"
    assert _current_user_with(monkeypatch, [{"id": "u1", "role": None}], {"role": "librarian"}).role == "guest"


def test_the_role_in_the_profiles_table_wins(monkeypatch):
    user = _current_user_with(monkeypatch, [{"id": "u1", "role": "student"}], {"role": "librarian"})
    assert user.role == "student"


# ── a student's data ──

MINE, THEIRS = "student-a", "student-b"


def _loan(student_id: str, fine: float = 0.0) -> dict:
    return {
        "id": f"loan-{student_id}", "student_id": student_id, "book_copy_id": f"copy-{student_id}", "status": "returned",
        "borrowed_at": "2026-10-01T00:00:00+00:00", "due_date": "2026-10-08T00:00:00+00:00",
        "fine_amount": fine, "fine_status": "unsettled" if fine else "none", "condition_at_borrow": "good",
    }


def _notification(user_id: str) -> dict:
    return {
        "id": f"n-{user_id}", "user_id": user_id, "type": "overdue", "title": "Overdue", "message": "x", "is_read": False,
        "created_at": "2026-10-01T00:00:00+00:00",
    }


@pytest.fixture
def scoped(as_user, monkeypatch):
    """The admin client sees everyone; the caller's own client sees what RLS
    would show them."""
    everything = dict(
        loans=[_loan(MINE), _loan(THEIRS, fine=25.0)],
        notifications=[_notification(MINE), _notification(THEIRS)],
        book_copies=[], books=[], profiles=[], reservations=[], library_settings=[],
    )
    admin = FakeSupabase(**everything)
    own = FakeSupabase(
        **{**everything, "loans": [_loan(MINE)], "notifications": [_notification(MINE)]},
    )
    for module in (loans_router, notifications_router):
        monkeypatch.setattr(module, "get_admin_client", lambda: admin)
        monkeypatch.setattr(module, "maybe_sweep_expired_reservations", lambda _db: None)
    client = as_user(_user("student", MINE))
    app.dependency_overrides[get_user_supabase] = lambda: own
    return client


def test_a_student_gets_only_their_own_loans_and_fines(scoped):
    body = scoped.get("/loans", headers=AUTH).json()
    assert [l["student_id"] for l in body] == [MINE]


def test_asking_for_another_students_loans_and_fines_returns_nothing(scoped):
    assert scoped.get("/loans", headers=AUTH, params={"student_id": THEIRS}).json() == []


def test_a_student_gets_only_their_own_notifications(scoped):
    body = scoped.get("/notifications", headers=AUTH).json()
    assert [n["user_id"] for n in body] == [MINE]


def test_a_student_cant_mark_another_students_notification_read(scoped):
    assert scoped.patch(f"/notifications/n-{THEIRS}", headers=AUTH, json={}).status_code == 404


# ── chat history ──

@pytest.fixture
def chat(as_user, monkeypatch):
    db = FakeSupabase(
        chat_sessions=[{"id": "their-chat", "student_id": THEIRS}, {"id": "guest-chat", "student_id": None}],
        chat_messages=[{"session_id": "their-chat", "role": "user", "content": "private question", "sources": []}],
    )
    monkeypatch.setattr(chat_router, "get_admin_client", lambda: db)
    return as_user(_user("student", MINE))


def test_a_student_cant_read_another_students_chat(chat):
    assert chat.get("/chat/sessions/their-chat", headers=AUTH).status_code == 403


def test_a_student_cant_delete_another_students_chat(chat):
    assert chat.delete("/chat/sessions/their-chat", headers=AUTH).status_code == 403


def test_a_student_cant_continue_another_students_chat(chat):
    # Continuing would put that chat's history in front of the model.
    res = chat.post("/chat/message", headers=AUTH, json={"message": "what did I ask?", "session_id": "their-chat"})
    assert res.status_code == 403


def test_a_student_can_list_only_their_own_chats(chat):
    assert chat.get("/chat/sessions", headers=AUTH).json() == []


# ── reservations are written by the API ──

def test_cancelling_writes_through_the_admin_client(as_user, monkeypatch):
    row = {"id": "r1", "user_id": MINE, "book_id": "b1", "book_copy_id": None, "status": "pending",
           "requested_at": "2026-10-01T00:00:00+00:00"}
    admin = FakeSupabase(reservations=[dict(row)], books=[{"id": "b1", "title": "Book"}])
    own = FakeSupabase(reservations=[dict(row)])
    monkeypatch.setattr(reservations_router, "get_admin_client", lambda: admin)
    monkeypatch.setattr(reservations_router, "notify_librarians", lambda *a, **k: None)
    client = as_user(_user("student", MINE))
    app.dependency_overrides[get_user_supabase] = lambda: own

    client.patch("/reservations/r1", headers=AUTH, json={"status": "cancelled"})
    assert admin.tables["reservations"][0]["status"] == "cancelled"
    assert own.writes == []


def test_a_student_cant_cancel_a_reservation_rls_hides_from_them(as_user, monkeypatch):
    admin = FakeSupabase(reservations=[{"id": "r2", "user_id": THEIRS, "status": "pending"}])
    monkeypatch.setattr(reservations_router, "get_admin_client", lambda: admin)
    client = as_user(_user("student", MINE))
    app.dependency_overrides[get_user_supabase] = lambda: FakeSupabase(reservations=[])

    assert client.patch("/reservations/r2", headers=AUTH, json={"status": "cancelled"}).status_code == 404
    assert admin.tables["reservations"][0]["status"] == "pending"
