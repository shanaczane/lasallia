-- 0021_book_cooccurrence.sql
-- Recommendations plan, Phase 4 — collaborative re-ranking signal.
-- Deny-by-default RLS (no select policy), same as book_similarities
-- (migrations/0017): only ever read by the admin client inside
-- core/recommendations.py:get_recommendations_for_student, nothing
-- public ever browses "what co-occurs with X."
--
-- Privacy rule (hard, enforced in core/cooccurrence.py before a row is
-- ever written, not here): a pair with fewer than 3 distinct
-- contributing students is dropped entirely, never stored with a flag.

create table if not exists book_cooccurrence (
  book_id           uuid not null references books(id) on delete cascade,
  neighbor_book_id  uuid not null references books(id) on delete cascade,
  student_count     int not null,
  lift              real not null,
  computed_at       timestamptz not null default now(),
  primary key (book_id, neighbor_book_id)
);

alter table book_cooccurrence enable row level security;

create index if not exists book_cooccurrence_book_idx on book_cooccurrence (book_id);

-- Same reasoning as 0017's replace_book_similarities: full nightly
-- rebuild, TRUNCATE (not DELETE, which pg-safeupdate on this project
-- blocks unqualified) inside one RPC call so a partial write between two
-- separate REST calls can't leave the table empty mid-scoring.
create or replace function replace_book_cooccurrence(rows jsonb)
returns void as $$
begin
  truncate table book_cooccurrence;

  insert into book_cooccurrence (book_id, neighbor_book_id, student_count, lift, computed_at)
  select
    (r->>'book_id')::uuid,
    (r->>'neighbor_book_id')::uuid,
    (r->>'student_count')::int,
    (r->>'lift')::real,
    now()
  from jsonb_array_elements(rows) as r;
end;
$$ language plpgsql;

revoke execute on function replace_book_cooccurrence(jsonb) from public, anon, authenticated;
grant execute on function replace_book_cooccurrence(jsonb) to service_role;
