-- 0018_student_recommendations.sql
-- Recommendations plan, Phase 5 — precomputed per-student
-- recommendations. Written only by jobs/rebuild_recommendations.py (the
-- service-role client, via the RPC below); read by GET /recommendations/me
-- through the caller's own RLS-scoped client, same split as saved_books
-- (migrations/0013): the job writes with elevated access, the student
-- only ever gets to see their own rows.

create table if not exists student_recommendations (
  student_id       uuid not null references profiles(id) on delete cascade,
  book_id          uuid not null references books(id) on delete cascade,
  rank             smallint not null,
  score            real not null,
  reason           text not null,
  reason_book_id   uuid references books(id),
  generated_at     timestamptz not null default now(),
  primary key (student_id, book_id)
);

alter table student_recommendations enable row level security;

create index if not exists student_recommendations_rank_idx on student_recommendations (student_id, rank);

create policy "student_recommendations_select_own" on student_recommendations
  for select to authenticated
  using (student_id = auth.uid());

-- Same reasoning as migrations/0017's replace_book_similarities: no
-- client-side multi-statement transaction, and this table gets fully
-- rebuilt every night for every student in one job run, so a partial
-- write between two separate REST calls (truncate, then insert) would
-- leave every student with an empty "For You" section until the next
-- run. TRUNCATE (not DELETE) — pg-safeupdate on this project blocks an
-- unqualified DELETE, including a `where true` bypass, but doesn't hook
-- TRUNCATE at all.
create or replace function replace_student_recommendations(rows jsonb)
returns void as $$
begin
  truncate table student_recommendations;

  insert into student_recommendations (student_id, book_id, rank, score, reason, reason_book_id, generated_at)
  select
    (r->>'student_id')::uuid,
    (r->>'book_id')::uuid,
    (r->>'rank')::smallint,
    (r->>'score')::real,
    r->>'reason',
    nullif(r->>'reason_book_id', '')::uuid,
    now()
  from jsonb_array_elements(rows) as r;
end;
$$ language plpgsql;

revoke execute on function replace_student_recommendations(jsonb) from public, anon, authenticated;
grant execute on function replace_student_recommendations(jsonb) to service_role;
