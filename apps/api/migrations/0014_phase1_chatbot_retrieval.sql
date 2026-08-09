-- 0014_phase1_chatbot_retrieval.sql
-- Phase 1 of the chatbot plan: semantic search over the catalog. No LLM,
-- no chat UI yet — this proves retrieval works in isolation first.
--
-- book_embeddings has no RLS policies (deny by default) — same pattern as
-- soft_holds/station_sessions. Every read goes through the search
-- endpoint (routers/search.py), which uses the service-role client;
-- there's no legitimate reason for a client to query this table directly.
create extension if not exists vector;

create table if not exists book_embeddings (
  book_id       uuid primary key references books(id) on delete cascade,
  embedding     vector(1536) not null,
  embedded_text text not null,
  model         text not null,
  updated_at    timestamptz not null default now()
);

alter table book_embeddings enable row level security;

-- Cheap to add now even at ~185 rows — saves a future migration once the
-- catalog grows past what a sequential scan handles comfortably.
create index if not exists book_embeddings_hnsw
  on book_embeddings using hnsw (embedding vector_cosine_ops);

-- ─── Hybrid search ──────────────────────────────────────────────────────
-- PostgREST can't express vector-distance ordering, full-text ranking,
-- and fusing the two in a single filtered select() — same reasoning as
-- claim_copy_for_book (migrations/0006). Fuses via Reciprocal Rank Fusion
-- (1/(60+rank) per ranking, summed) and boosts an exact title/call-number
-- match to the top, per the chatbot plan's 1.4.
--
-- Uses the 'simple' text search config, not 'english' — English stemming
-- doesn't help Taglish queries, and Postgres has no Filipino config
-- available by default. This is a real limitation, not a fix; the
-- chatbot plan's own Phase 6 is where Taglish retrieval gets measured
-- and improved.
create or replace function hybrid_search_books(
  query_embedding vector(1536),
  query_text text,
  match_count int default 20
) returns table (book_id uuid, score float) as $$
  with vector_ranked as (
    select be.book_id,
           row_number() over (order by be.embedding <=> query_embedding) as rank
    from book_embeddings be
    order by be.embedding <=> query_embedding
    limit 50
  ),
  fulltext_ranked as (
    select b.id as book_id,
           row_number() over (
             order by ts_rank(
               to_tsvector('simple', coalesce(b.title, '') || ' ' || coalesce(b.author, '') || ' ' || coalesce(b.subject, '') || ' ' || coalesce(b.call_number, '')),
               plainto_tsquery('simple', query_text)
             ) desc
           ) as rank
    from books b
    where to_tsvector('simple', coalesce(b.title, '') || ' ' || coalesce(b.author, '') || ' ' || coalesce(b.subject, '') || ' ' || coalesce(b.call_number, ''))
          @@ plainto_tsquery('simple', query_text)
    limit 50
  ),
  fused as (
    select coalesce(v.book_id, f.book_id) as book_id,
           (1.0 / (60 + coalesce(v.rank, 1000))) + (1.0 / (60 + coalesce(f.rank, 1000))) as fused_score
    from vector_ranked v
    full outer join fulltext_ranked f on v.book_id = f.book_id
  ),
  exact as (
    select b.id as book_id
    from books b
    where lower(b.title) = lower(query_text) or lower(b.call_number) = lower(query_text)
  )
  select f.book_id, f.fused_score + (case when e.book_id is not null then 1.0 else 0 end) as score
  from fused f
  left join exact e on e.book_id = f.book_id
  order by score desc
  limit match_count;
$$ language sql stable;

-- Only this app's own backend (service_role) may call this — same
-- lockdown as claim_copy_for_book.
revoke execute on function hybrid_search_books(vector, text, int) from public, anon, authenticated;
grant execute on function hybrid_search_books(vector, text, int) to service_role;
