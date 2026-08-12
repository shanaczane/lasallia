-- 0017_book_similarities.sql
-- Recommendations plan, Phase 2 — the TF-IDF item-item similarity
-- matrix. Only the top 30 neighbors per book (score > 0.05) are stored;
-- a full N×N matrix is wasteful for a catalog this size and pointless
-- past the neighbors Phase 3 actually reads.
--
-- Written only via the service-role client (jobs/rebuild_similarities.py)
-- — no policies means deny-by-default for every other caller, same
-- pattern as policy_chunks (migrations/0015).

create table if not exists book_similarities (
  book_id           uuid not null references books(id) on delete cascade,
  neighbor_book_id  uuid not null references books(id) on delete cascade,
  score             real not null,
  rank              smallint not null,
  computed_at       timestamptz not null default now(),
  primary key (book_id, neighbor_book_id)
);

alter table book_similarities enable row level security;

create index if not exists book_similarities_rank_idx on book_similarities (book_id, rank);

-- ─── Atomic full rebuild ─────────────────────────────────────────────────
-- PostgREST has no multi-statement transaction from the client (same
-- constraint noted in migrations/0006's claim_copy_for_book) — a plain
-- delete-then-insert over two REST calls could leave the table empty if
-- the process dies between them, which is a real risk for a table the
-- recommendation job reads on every request. Computing the rows in
-- Python and handing them to this function as one call keeps the
-- truncate-and-replace as a single Postgres transaction.
create or replace function replace_book_similarities(rows jsonb)
returns void as $$
begin
  -- pg-safeupdate (enabled on this Supabase project) rejects an
  -- unqualified DELETE/UPDATE outright, including `where true`-style
  -- bypasses (that's specifically what it's designed to catch). TRUNCATE
  -- isn't intercepted by it at all, and it's the actual operation this
  -- function name promises.
  truncate table book_similarities;

  insert into book_similarities (book_id, neighbor_book_id, score, rank, computed_at)
  select
    (r->>'book_id')::uuid,
    (r->>'neighbor_book_id')::uuid,
    (r->>'score')::real,
    (r->>'rank')::smallint,
    now()
  from jsonb_array_elements(rows) as r;
end;
$$ language plpgsql;

revoke execute on function replace_book_similarities(jsonb) from public, anon, authenticated;
grant execute on function replace_book_similarities(jsonb) to service_role;
