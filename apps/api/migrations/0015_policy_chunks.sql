-- 0015_policy_chunks.sql
-- Phase 4 of the chatbot plan: LRC handbook retrieval. Mirrors
-- book_embeddings' shape (migration 0014) for a second document type.
--
-- No RLS policies (deny by default) — same reasoning as book_embeddings:
-- every read goes through the search_policy tool (service-role client),
-- there's no legitimate reason for a client to query this table directly.
create table if not exists policy_chunks (
  id            uuid primary key default gen_random_uuid(),
  chunk_text    text not null,
  section_title text not null,
  source_page   int,
  version       text not null,
  embedding     vector(1536) not null,
  updated_at    timestamptz not null default now()
);

alter table policy_chunks enable row level security;

create index if not exists policy_chunks_hnsw
  on policy_chunks using hnsw (embedding vector_cosine_ops);

create index if not exists policy_chunks_version_idx on policy_chunks (version);

-- ─── Semantic search over policy chunks ────────────────────────────────
-- Plain vector search, not hybrid — unlike hybrid_search_books (0014),
-- there's no meaningful "exact title match" concept for prose policy
-- text, and no accession-number-style identifiers to catch with
-- full-text search. Same service-role-only lockdown as
-- claim_copy_for_book / hybrid_search_books.
create or replace function search_policy_chunks(
  query_embedding vector(1536),
  match_count int default 5
) returns table (id uuid, chunk_text text, section_title text, source_page int, score float) as $$
  select pc.id, pc.chunk_text, pc.section_title, pc.source_page,
         1 - (pc.embedding <=> query_embedding) as score
  from policy_chunks pc
  order by pc.embedding <=> query_embedding
  limit match_count;
$$ language sql stable;

revoke execute on function search_policy_chunks(vector, int) from public, anon, authenticated;
grant execute on function search_policy_chunks(vector, int) to service_role;
