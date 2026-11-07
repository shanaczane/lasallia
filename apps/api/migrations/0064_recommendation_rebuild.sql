-- 0064_recommendation_rebuild.sql
-- For the nightly recommendation rebuild (similarities, then co-borrowing,
-- then recommendations).
--
-- recommendation_rebuild_runs: one row per run, with its start and end times
-- and the step it reached, so a run that stopped partway can be seen. A run
-- still 'running' from a restart is closed as 'interrupted' by the next run.
--
-- book_similarities_staging: the whole catalog's similarity rows are too many
-- for one call to replace_book_similarities, so the job sends them in
-- batches and publishes them in one transaction. The live table stays as it
-- was until publish, like the single call in 0017.
--
-- No policies on either table: deny by default, service-role only.
--
-- Additive. To undo:
--   drop function if exists publish_book_similarities();
--   drop function if exists stage_book_similarities(jsonb);
--   drop function if exists begin_book_similarities_rebuild();
--   drop table if exists book_similarities_staging;
--   drop table if exists recommendation_rebuild_runs;

create table if not exists recommendation_rebuild_runs (
  id            uuid primary key default gen_random_uuid(),
  triggered_by  text not null check (triggered_by in ('cron', 'manual')),
  status        text not null default 'running'
                  check (status in ('running', 'succeeded', 'failed', 'interrupted')),
  step_reached  text check (step_reached in ('similarities', 'cooccurrence', 'recommendations')),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  summary       jsonb not null default '{}'::jsonb,
  error         text
);

alter table recommendation_rebuild_runs enable row level security;

create index if not exists recommendation_rebuild_runs_started_idx
  on recommendation_rebuild_runs (started_at desc);

-- Only one run at a time, across every API instance.
create unique index if not exists recommendation_rebuild_runs_one_running
  on recommendation_rebuild_runs ((status)) where status = 'running';

create table if not exists book_similarities_staging (
  book_id           uuid not null,
  neighbor_book_id  uuid not null,
  score             real not null,
  rank              smallint not null,
  primary key (book_id, neighbor_book_id)
);

alter table book_similarities_staging enable row level security;

-- TRUNCATE, not DELETE: see the pg-safeupdate note in 0017.
create or replace function begin_book_similarities_rebuild()
returns void as $$
begin
  truncate table book_similarities_staging;
end;
$$ language plpgsql;

create or replace function stage_book_similarities(rows jsonb)
returns void as $$
begin
  insert into book_similarities_staging (book_id, neighbor_book_id, score, rank)
  select
    (r->>'book_id')::uuid,
    (r->>'neighbor_book_id')::uuid,
    (r->>'score')::real,
    (r->>'rank')::smallint
  from jsonb_array_elements(rows) as r;
end;
$$ language plpgsql;

-- One transaction: readers see the old rows or the new ones, never neither.
-- Books deleted since the batches were sent are left out.
create or replace function publish_book_similarities()
returns void as $$
begin
  truncate table book_similarities;

  insert into book_similarities (book_id, neighbor_book_id, score, rank, computed_at)
  select s.book_id, s.neighbor_book_id, s.score, s.rank, now()
  from book_similarities_staging s
  where exists (select 1 from books b where b.id = s.book_id)
    and exists (select 1 from books b where b.id = s.neighbor_book_id);

  truncate table book_similarities_staging;
end;
$$ language plpgsql;

revoke execute on function begin_book_similarities_rebuild() from public, anon, authenticated;
revoke execute on function stage_book_similarities(jsonb) from public, anon, authenticated;
revoke execute on function publish_book_similarities() from public, anon, authenticated;
grant execute on function begin_book_similarities_rebuild() to service_role;
grant execute on function stage_book_similarities(jsonb) to service_role;
grant execute on function publish_book_similarities() to service_role;

notify pgrst, 'reload schema';
