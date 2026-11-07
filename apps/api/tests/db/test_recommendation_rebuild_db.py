# migrations/0064_recommendation_rebuild.sql against a real Postgres.

from pathlib import Path

import pytest
from psycopg import errors
from psycopg.types.json import Jsonb

MIGRATION = Path(__file__).resolve().parents[2] / "migrations" / "0064_recommendation_rebuild.sql"


@pytest.fixture
def db(conn):
    conn.execute("""
        create table book_similarities (
          book_id           uuid not null references books(id) on delete cascade,
          neighbor_book_id  uuid not null references books(id) on delete cascade,
          score             real not null,
          rank              smallint not null,
          computed_at       timestamptz not null default now(),
          primary key (book_id, neighbor_book_id)
        );
    """)
    for _ in range(2):
        conn.execute(MIGRATION.read_text(encoding="utf-8"))
    return conn


def _books(db, n=3) -> list[str]:
    return [
        db.execute("insert into books (title, author) values (%s, 'A') returning id::text", (f"Book {i}",)).fetchone()[0]
        for i in range(n)
    ]


def _row(book, neighbor, score=0.5, rank=1) -> dict:
    return {"book_id": book, "neighbor_book_id": neighbor, "score": score, "rank": rank}


def _stage(db, rows):
    db.execute("select stage_book_similarities(%s)", (Jsonb(rows),))


def _live(db) -> int:
    return db.execute("select count(*) from book_similarities").fetchone()[0]


def test_batches_only_go_live_on_publish(db):
    a, b, c = _books(db)
    db.execute("insert into book_similarities (book_id, neighbor_book_id, score, rank) values (%s, %s, 0.9, 1)", (a, b))

    db.execute("select begin_book_similarities_rebuild()")
    _stage(db, [_row(a, c)])
    _stage(db, [_row(b, c), _row(c, a)])
    assert db.execute("select neighbor_book_id::text from book_similarities").fetchone()[0] == b

    db.execute("select publish_book_similarities()")
    assert _live(db) == 3
    assert db.execute("select count(*) from book_similarities_staging").fetchone()[0] == 0


def test_a_run_that_stops_after_staging_leaves_the_live_table_alone(db):
    a, b, c = _books(db)
    db.execute("insert into book_similarities (book_id, neighbor_book_id, score, rank) values (%s, %s, 0.9, 1)", (a, b))
    db.execute("select begin_book_similarities_rebuild()")
    _stage(db, [_row(a, c)])
    # Next night starts clean.
    db.execute("select begin_book_similarities_rebuild()")
    assert db.execute("select count(*) from book_similarities_staging").fetchone()[0] == 0
    assert _live(db) == 1


def test_a_book_deleted_since_staging_is_left_out(db):
    a, b, c = _books(db)
    db.execute("select begin_book_similarities_rebuild()")
    _stage(db, [_row(a, b), _row(b, c)])
    db.execute("delete from books where id = %s", (c,))
    db.execute("select publish_book_similarities()")
    assert _live(db) == 1


def test_only_one_run_can_be_running(db):
    db.execute("insert into recommendation_rebuild_runs (triggered_by) values ('cron')")
    with pytest.raises(errors.UniqueViolation):
        db.execute("insert into recommendation_rebuild_runs (triggered_by) values ('manual')")


def test_finished_runs_dont_block_the_next(db):
    run_id = db.execute("insert into recommendation_rebuild_runs (triggered_by) values ('cron') returning id").fetchone()[0]
    db.execute("update recommendation_rebuild_runs set status = 'failed', step_reached = 'cooccurrence' where id = %s", (run_id,))
    db.execute("insert into recommendation_rebuild_runs (triggered_by) values ('cron')")


@pytest.mark.parametrize("call", [
    "select begin_book_similarities_rebuild()",
    "select publish_book_similarities()",
])
@pytest.mark.parametrize("role", ["anon", "authenticated"])
def test_browsers_cant_run_the_rebuild_functions(db, role, call):
    db.execute(f"set role {role}")
    try:
        with pytest.raises(errors.InsufficientPrivilege):
            db.execute(call)
    finally:
        db.execute("reset role")
