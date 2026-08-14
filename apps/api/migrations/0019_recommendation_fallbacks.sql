-- 0019_recommendation_fallbacks.sql
-- Recommendations plan, Phase 7 — rungs 2-4 of the cold-start fallback
-- ladder. Both tables are public-read (same as `books_select_all` in
-- 0001_core_schema.sql): program_recommendations backs a logged-in
-- student's rung-2 fallback, popular_recommendations backs both a
-- logged-in student's rung-3/4 fallback (GET /recommendations/me) and
-- the fully public GET /recommendations/popular (rung 0, guests). Both
-- are written only by jobs/rebuild_recommendations.py via the
-- service-role RPCs below — same split as student_recommendations
-- (0018): the job writes with elevated access, everyone else only reads.

create table if not exists program_recommendations (
  program        text not null,
  rank           smallint not null,
  book_id        uuid not null references books(id) on delete cascade,
  reason         text not null,
  generated_at   timestamptz not null default now(),
  primary key (program, rank)
);

alter table program_recommendations enable row level security;

create policy "program_recommendations_select_all" on program_recommendations
  for select to anon, authenticated
  using (true);

create table if not exists popular_recommendations (
  rank           smallint primary key,
  book_id        uuid not null references books(id) on delete cascade,
  reason         text not null,
  generated_at   timestamptz not null default now()
);

alter table popular_recommendations enable row level security;

create policy "popular_recommendations_select_all" on popular_recommendations
  for select to anon, authenticated
  using (true);

-- Same reasoning as 0018's replace_student_recommendations: no
-- client-side multi-statement transaction, full rebuild every night,
-- TRUNCATE (not DELETE) since pg-safeupdate on this project blocks an
-- unqualified DELETE but doesn't hook TRUNCATE.
create or replace function replace_program_recommendations(rows jsonb)
returns void as $$
begin
  truncate table program_recommendations;

  insert into program_recommendations (program, rank, book_id, reason, generated_at)
  select
    r->>'program',
    (r->>'rank')::smallint,
    (r->>'book_id')::uuid,
    r->>'reason',
    now()
  from jsonb_array_elements(rows) as r;
end;
$$ language plpgsql;

revoke execute on function replace_program_recommendations(jsonb) from public, anon, authenticated;
grant execute on function replace_program_recommendations(jsonb) to service_role;

create or replace function replace_popular_recommendations(rows jsonb)
returns void as $$
begin
  truncate table popular_recommendations;

  insert into popular_recommendations (rank, book_id, reason, generated_at)
  select
    (r->>'rank')::smallint,
    (r->>'book_id')::uuid,
    r->>'reason',
    now()
  from jsonb_array_elements(rows) as r;
end;
$$ language plpgsql;

revoke execute on function replace_popular_recommendations(jsonb) from public, anon, authenticated;
grant execute on function replace_popular_recommendations(jsonb) to service_role;
