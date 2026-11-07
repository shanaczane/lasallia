# The nightly rebuild: paging past PostgREST's row limit, chunked similarity,
# the fixed recommendation values, the run log and the protected endpoint.
# The database is faked; the staging functions are in
# tests/db/test_recommendation_rebuild_db.py.

import logging
import sys
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

import core.config as config
import core.recommendation_rebuild as rebuild
import core.recommendations as recs
import core.similarities as sims
import routers.internal as internal_router
import routers.recommendations as recs_router
import scripts.explain_recommendations as explain
from core.cooccurrence import LIFT_CEILING, MIN_COOCCURRENCE_STUDENTS, _load_student_books
from core.paging import fetch_all_rows, fetch_rows_for_ids
from tests.fake_supabase import FakeSupabase


def _ago(days: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


# ── the values the manuscript quotes ──

def test_the_recommendation_values_are_unchanged():
    assert recs.RECENCY_HALF_LIFE_DAYS == 180
    assert recs.RESERVATION_WEIGHT == 0.7
    assert recs.COOCCURRENCE_ALPHA == 0.3
    assert LIFT_CEILING == 5.0
    assert MIN_COOCCURRENCE_STUDENTS == 3
    assert 1 + recs.PROGRAM_ALPHA == 1.15
    assert sims.TOP_N_NEIGHBORS == 30
    assert sims.MIN_SCORE == 0.05
    assert recs.DIVERSITY_CAP_PER_CATEGORY == 3
    assert rebuild.STORED_PER_STUDENT == 20
    assert recs_router.STORED_LIMIT == 20
    assert recs_router.DEFAULT_LIMIT == 8
    assert recs_router.STALE_AFTER_DAYS == 7


# ── paging ──

def _capped(**tables) -> FakeSupabase:
    db = FakeSupabase(**tables)
    db.max_rows = 1000
    return db


def test_fetch_all_rows_reads_past_the_row_limit():
    db = _capped(books=[{"id": str(i)} for i in range(2500)])
    assert db.table("books").select("id").execute().data.__len__() == 1000
    assert len(fetch_all_rows(lambda: db.table("books").select("id").order("id"))) == 2500


def test_fetch_rows_for_ids_splits_long_lists_and_pages_each():
    db = _capped(book_similarities=[{"book_id": str(i % 300), "n": i} for i in range(3000)])
    rows = fetch_rows_for_ids(
        lambda ids: db.table("book_similarities").select("*").in_("book_id", ids).order("book_id"),
        [str(i) for i in range(300)],
        chunk=100,
    )
    assert len(rows) == 3000


def _similarity_db(books) -> FakeSupabase:
    db = _capped(books=books)
    db.staged, db.calls = [], []

    def record(name):
        def handler(params):
            db.calls.append(name)
            db.staged.extend(params.get("rows", []))
        return handler

    for name in ("begin_book_similarities_rebuild", "stage_book_similarities", "publish_book_similarities"):
        db.rpc_handlers[name] = record(name)
    return db


def _catalog(n: int) -> list[dict]:
    topics = ["network security", "database systems", "philippine history", "nursing care", "constitutional law"]
    return [
        {"id": f"book-{i:05d}", "title": f"{topics[i % 5]} volume {i % 7}", "author": f"author {i % 11}", "subject": topics[i % 5], "abstract": None}
        for i in range(n)
    ]


def test_similarities_cover_the_whole_catalog_past_the_row_limit():
    db = _similarity_db(_catalog(1300))
    result = sims.rebuild_similarities(db)
    assert result.updated == 1300
    assert {r["book_id"] for r in db.staged} == {f"book-{i:05d}" for i in range(1300)}


def test_chunk_size_doesnt_change_the_scores(monkeypatch):
    results = []
    for chunk in (7, 10_000):
        monkeypatch.setattr(sims, "CHUNK_BOOKS", chunk)
        db = _similarity_db(_catalog(60))
        sims.rebuild_similarities(db)
        results.append(sorted((r["book_id"], r["rank"], r["neighbor_book_id"], round(r["score"], 10)) for r in db.staged))
    assert results[0] == results[1]


def test_neighbors_keep_the_top_30_above_0_05():
    db = _similarity_db(_catalog(200))
    sims.rebuild_similarities(db)
    per_book: dict[str, list[dict]] = {}
    for row in db.staged:
        per_book.setdefault(row["book_id"], []).append(row)
    assert max(len(rows) for rows in per_book.values()) == 30
    assert all(r["score"] > 0.05 for r in db.staged)
    assert all(r["book_id"] != r["neighbor_book_id"] for r in db.staged)
    for rows in per_book.values():
        scores = [r["score"] for r in sorted(rows, key=lambda r: r["rank"])]
        assert scores == sorted(scores, reverse=True)


def test_rows_are_staged_in_batches_then_published_once(monkeypatch):
    monkeypatch.setattr(sims, "CHUNK_BOOKS", 10)
    monkeypatch.setattr(sims, "WRITE_BATCH_ROWS", 50)
    db = _similarity_db(_catalog(60))
    sims.rebuild_similarities(db)
    assert db.calls[0] == "begin_book_similarities_rebuild"
    assert db.calls[-1] == "publish_book_similarities"
    assert db.calls.count("publish_book_similarities") == 1
    assert db.calls.count("stage_book_similarities") > 1


def test_a_failure_while_staging_never_publishes():
    db = _similarity_db(_catalog(60))

    def fail(_params):
        raise RuntimeError("connection lost")

    db.rpc_handlers["stage_book_similarities"] = fail
    with pytest.raises(RuntimeError):
        sims.rebuild_similarities(db)
    assert "publish_book_similarities" not in db.calls


def test_co_borrowing_reads_every_loan():
    loans = [{"id": str(i), "student_id": f"s{i % 1500}", "book_copies": {"book_id": "b"}} for i in range(1500)]
    assert len(_load_student_books(_capped(loans=loans))) == 1500


def test_a_student_with_many_sources_keeps_all_their_neighbors():
    # 40 sources × 30 neighbors is over the row limit.
    recs._non_borrowable_cache = None
    sources = [f"src-{i}" for i in range(40)]
    db = _capped(
        profiles=[{"id": "s1", "program": None}],
        loans=[{"id": b, "student_id": "s1", "status": "returned", "borrowed_at": _ago(0), "book_copies": {"book_id": b}} for b in sources],
        reservations=[],
        book_similarities=[
            {"book_id": b, "neighbor_book_id": f"cand-{b}-{n}", "score": 0.5 - n / 100}
            for b in sources for n in range(30)
        ],
        book_cooccurrence=[],
        books=[{"id": b, "title": b, "category": None} for b in sources],
    )
    assert score_count(db) == 1200


def score_count(db) -> int:
    return recs.score_student(db, "s1", limit=20).candidate_count


# ── a worked example, by hand ──

@pytest.fixture
def worked():
    """Two sources, one 180 days old (weight 0.5) and one reserved today
    (weight 0.7), and three candidates."""
    recs._non_borrowable_cache = None
    return FakeSupabase(
        profiles=[
            {"id": "s1", "email": "s1@dlsl.edu.ph", "role": "student", "program": "BSIT"},
            {"id": S1, "email": "s1-uuid@dlsl.edu.ph", "role": "student", "program": "BSIT"},
        ],
        loans=[
            {"id": f"l-{s}", "student_id": s, "status": "returned", "borrowed_at": _ago(180), "book_copies": {"book_id": "a"}}
            for s in ("s1", S1)
        ],
        reservations=[
            {"id": f"r-{s}", "user_id": s, "book_id": "b", "status": "pending", "requested_at": _ago(0)}
            for s in ("s1", S1)
        ],
        book_similarities=[
            {"book_id": "a", "neighbor_book_id": "x", "score": 0.4},
            {"book_id": "b", "neighbor_book_id": "x", "score": 0.2},
            {"book_id": "a", "neighbor_book_id": "y", "score": 0.6},
            {"book_id": "b", "neighbor_book_id": "z", "score": 0.1},
        ],
        book_cooccurrence=[{"book_id": "a", "neighbor_book_id": "y", "lift": 3.0}],
        books=[
            {"id": "a", "title": "Book A", "category": "BSIT"},
            {"id": "b", "title": "Book B", "category": "Law"},
            {"id": "x", "title": "Book X", "category": "Law"},
            {"id": "y", "title": "Book Y", "category": "BSIT"},
            {"id": "z", "title": "Book Z", "category": "Law"},
        ],
        student_recommendations=[],
    )


def test_the_worked_example_matches_a_hand_calculation(worked):
    scoring = recs.score_student(worked, "s1", limit=20)
    assert scoring.sources["a"].weight == pytest.approx(0.5, abs=1e-4)
    assert scoring.sources["b"].weight == pytest.approx(0.7, abs=1e-4)

    y, x, z = scoring.picks
    assert [y.book_id, x.book_id, z.book_id] == ["y", "x", "z"]

    # Y: 0.6 × 0.5 = 0.3; lift 3 → (3-1)/(5-1) = 0.5 → ×1.15; BSIT match → ×1.15.
    assert y.content_score == pytest.approx(0.3, abs=1e-4)
    assert y.normalized_boost == pytest.approx(0.5)
    assert y.lift_multiplier == pytest.approx(1.15)
    assert y.program_multiplier == pytest.approx(1.15)
    assert y.score == pytest.approx(0.3 * 1.15 * 1.15, abs=1e-4)
    assert y.reason == "Because you borrowed Book A · popular with students who read it · matches your program"

    # X: 0.4 × 0.5 + 0.2 × 0.7 = 0.34, no boosts. The top source is A (0.2 vs
    # 0.14, exactly 70%), so B counts as comparable.
    assert x.score == pytest.approx(0.34, abs=1e-4)
    assert x.lift is None
    assert x.reason_book_id == "a"


def test_get_recommendations_returns_the_same_picks_as_score_student(worked):
    picks = recs.score_student(worked, "s1", limit=20).picks
    returned = recs.get_recommendations_for_student(worked, "s1", limit=20)
    assert [(r.book_id, r.reason, r.reason_book_id) for r in returned] == [(p.book_id, p.reason, p.reason_book_id) for p in picks]
    assert [r.score for r in returned] == pytest.approx([p.score for p in picks])


def test_a_reservation_and_loan_of_the_same_book_keep_the_stronger(worked):
    worked.tables["loans"].append({"id": "l2", "student_id": "s1", "status": "active", "borrowed_at": _ago(0), "book_copies": {"book_id": "b"}})
    source = recs.score_student(worked, "s1", limit=20).sources["b"]
    assert source.kind == "Loan (active)"
    assert source.base_weight == 1.0


def test_no_history_means_no_picks():
    recs._non_borrowable_cache = None
    db = FakeSupabase(profiles=[{"id": "s1"}], loans=[], reservations=[], books=[])
    assert recs.get_recommendations_for_student(db, "s1") == []


def test_the_diversity_cap_keeps_three_per_category():
    recs._non_borrowable_cache = None
    db = FakeSupabase(
        profiles=[{"id": "s1", "program": None}],
        loans=[{"id": "l1", "student_id": "s1", "status": "returned", "borrowed_at": _ago(0), "book_copies": {"book_id": "a"}}],
        reservations=[],
        book_similarities=[{"book_id": "a", "neighbor_book_id": f"c{i}", "score": 0.9 - i / 100} for i in range(6)],
        book_cooccurrence=[],
        books=[{"id": "a", "title": "A", "category": "Law"}] + [{"id": f"c{i}", "title": f"C{i}", "category": "Law"} for i in range(6)],
    )
    scoring = recs.score_student(db, "s1", limit=20)
    assert [p.book_id for p in scoring.picks] == ["c0", "c1", "c2"]
    assert scoring.candidate_count == 6


# ── the explain script ──

S1 = "00000000-0000-0000-0000-000000000001"
S2 = "00000000-0000-0000-0000-000000000002"


def _run_explain(monkeypatch, capsys, db, *args) -> str:
    monkeypatch.setattr(explain, "get_admin_client", lambda: db)
    monkeypatch.setattr(sys, "argv", ["explain_recommendations.py", *args])
    explain.main()
    return capsys.readouterr().out


def test_the_script_prints_each_part_of_the_worked_example(monkeypatch, capsys, worked):
    out = _run_explain(monkeypatch, capsys, worked, S1)
    assert "Loan (returned)" in out and "Reservation (pending)" in out
    assert "half-life 180 days" in out
    assert "#1  Book Y" in out and "#2  Book X" in out and "#3  Book Z" in out
    assert "0.6000 x 0.5000" in out                       # similarity × source weight
    assert "Content score:   0.3000" in out
    assert "Lift:            3.0000" in out
    assert "Normalized boost: 0.5000" in out
    assert "Program boost:   x1.15" in out
    assert "Final score:     0.3000 x 1.1500 x 1.15 = 0.3967" in out
    assert "Because you borrowed Book A · popular with students who read it · matches your program" in out


def test_the_script_finds_a_student_by_email(monkeypatch, capsys, worked):
    assert "Book Y" in _run_explain(monkeypatch, capsys, worked, "s1@dlsl.edu.ph")


def test_the_script_respects_top(monkeypatch, capsys, worked):
    out = _run_explain(monkeypatch, capsys, worked, S1, "--top", "1")
    assert "#1  Book Y" in out and "#2  Book X" not in out


def test_the_script_writes_nothing(monkeypatch, capsys, worked):
    _run_explain(monkeypatch, capsys, worked, S1)
    assert worked.writes == [] and worked.rpc_calls == []


@pytest.mark.parametrize("student", ["nobody@dlsl.edu.ph", "not-an-id", S2])
def test_the_script_says_so_for_an_unknown_student(monkeypatch, capsys, worked, student):
    with pytest.raises(SystemExit, match="No account found"):
        _run_explain(monkeypatch, capsys, worked, student)


def test_the_script_explains_a_student_with_no_history(monkeypatch, capsys):
    recs._non_borrowable_cache = None
    db = FakeSupabase(profiles=[{"id": S2, "role": "student"}], loans=[], reservations=[], books=[])
    assert "fallback lists" in _run_explain(monkeypatch, capsys, db, S2)


# ── runs ──

@pytest.fixture
def run_db(monkeypatch):
    db = FakeSupabase(recommendation_rebuild_runs=[])
    db.column_defaults["recommendation_rebuild_runs"] = {"status": "running", "started_at": _ago(0), "summary": {}}
    db.order = []
    db.alerts = []

    class Result:
        updated, skipped_book_ids = 10, []
        pairs, total_students = 5, 3

    def step(name):
        def run(_admin):
            db.order.append(name)
            return Result if name != "recommendations" else {"students": 3}
        return run

    monkeypatch.setattr(rebuild, "rebuild_similarities", step("similarities"))
    monkeypatch.setattr(rebuild, "rebuild_cooccurrence", step("cooccurrence"))
    monkeypatch.setattr(rebuild, "rebuild_recommendations", step("recommendations"))
    monkeypatch.setattr(rebuild, "notify_librarians", lambda title, message, **_: db.alerts.append((title, message)))
    return db


def _run(db) -> dict:
    return db.tables["recommendation_rebuild_runs"][-1]


def test_a_run_goes_in_order_and_records_its_times(run_db):
    run_id = rebuild.start_run(run_db, "cron")
    rebuild.execute_run(run_db, run_id)
    assert run_db.order == ["similarities", "cooccurrence", "recommendations"]
    run = _run(run_db)
    assert run["status"] == "succeeded"
    assert run["step_reached"] == "recommendations"
    assert run["started_at"] and run["finished_at"]
    assert run["summary"]["similarities"]["books"] == 10
    assert run_db.alerts == []


def test_a_failed_step_stops_the_run_and_shows_how_far_it_got(run_db, monkeypatch, caplog):
    def fail(_admin):
        raise RuntimeError("out of memory")

    monkeypatch.setattr(rebuild, "rebuild_cooccurrence", fail)
    with caplog.at_level(logging.ERROR, logger="lasallia.rebuild"):
        rebuild.execute_run(run_db, rebuild.start_run(run_db, "cron"))

    run = _run(run_db)
    assert run["status"] == "failed"
    assert run["step_reached"] == "cooccurrence"
    assert run["finished_at"]
    assert "out of memory" in run["error"]
    assert run["summary"]["similarities"]["books"] == 10
    assert run_db.order == ["similarities"]
    assert "failed at step cooccurrence" in caplog.text
    assert run_db.alerts and "cooccurrence" in run_db.alerts[0][1]


def test_a_run_left_running_by_a_restart_is_closed_as_interrupted(run_db):
    run_db.tables["recommendation_rebuild_runs"].append({
        "id": "old", "status": "running", "step_reached": "similarities", "started_at": _ago(1),
    })
    rebuild.start_run(run_db, "cron")
    old = run_db.tables["recommendation_rebuild_runs"][0]
    assert old["status"] == "interrupted"
    assert old["step_reached"] == "similarities"
    assert old["finished_at"]


def test_a_run_in_progress_is_left_alone(run_db):
    run_db.tables["recommendation_rebuild_runs"].append({"id": "now", "status": "running", "started_at": _ago(0)})
    rebuild.start_run(run_db, "cron")
    assert run_db.tables["recommendation_rebuild_runs"][0]["status"] == "running"


# ── the endpoint ──

SECRET = "cron-secret"


@pytest.fixture
def endpoint(run_db, monkeypatch):
    monkeypatch.setattr(internal_router, "get_admin_client", lambda: run_db)
    monkeypatch.setattr(config, "INTERNAL_CRON_SECRET", SECRET)
    app = FastAPI()
    app.include_router(internal_router.router)
    return TestClient(app)


def _post(client, secret=SECRET):
    headers = {"X-Internal-Secret": secret} if secret else {}
    return client.post("/internal/rebuild-recommendations", headers=headers)


def test_the_right_secret_starts_a_run(endpoint, run_db):
    res = _post(endpoint)
    assert res.status_code == 202
    assert res.json()["run_id"]
    assert run_db.order == ["similarities", "cooccurrence", "recommendations"]
    assert _run(run_db)["triggered_by"] == "cron"


@pytest.mark.parametrize("secret", [None, "wrong"])
def test_a_missing_or_wrong_secret_is_refused(endpoint, run_db, secret):
    assert _post(endpoint, secret).status_code == 401
    assert run_db.tables["recommendation_rebuild_runs"] == []


def test_with_no_secret_configured_nothing_can_start_a_run(endpoint, run_db, monkeypatch):
    monkeypatch.setattr(config, "INTERNAL_CRON_SECRET", "")
    assert _post(endpoint, "").status_code == 503
    assert _post(endpoint, "anything").status_code == 503
    assert run_db.order == []


def test_a_second_run_at_once_is_refused(endpoint, run_db, monkeypatch):
    monkeypatch.setattr(internal_router, "start_run", lambda *_: None)
    assert _post(endpoint).status_code == 409
    assert run_db.order == []


def test_the_one_running_index_means_no_new_run(run_db, monkeypatch):
    class Query:
        def update(self, _fields):
            return self

        eq = lt = lambda self, *_: self

        def insert(self, _row):
            self.inserting = True
            return self

        def execute(self):
            if getattr(self, "inserting", False):
                raise APIError({"code": "23505", "message": "duplicate key"})

    monkeypatch.setattr(run_db, "table", lambda _name: Query())
    assert rebuild.start_run(run_db, "cron") is None


def test_the_internal_route_is_on_the_app_and_not_in_the_public_docs():
    from main import app

    assert any(getattr(r, "path", "") == "/internal/rebuild-recommendations" for r in app.routes)
    assert "/internal/rebuild-recommendations" not in app.openapi()["paths"]
