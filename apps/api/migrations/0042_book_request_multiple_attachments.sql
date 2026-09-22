-- 0042_book_request_multiple_attachments.sql
-- 0041 added a single attachment_url/attachment_name pair per request —
-- not enough when a faculty member wants to attach both a reading list PDF
-- and a screenshot of the listing. Replaces those two columns with a
-- proper one-to-many table, same pattern as every other per-row detail in
-- this schema, instead of a jsonb array. Storage stays the same bucket
-- (book-request-attachments, 0041) — this only changes how the DB tracks
-- which files belong to which request.
alter table book_requests
  drop column if exists attachment_url,
  drop column if exists attachment_name;

create table if not exists book_request_attachments (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references book_requests(id) on delete cascade,
  url         text not null,
  name        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists book_request_attachments_request_idx on book_request_attachments(request_id);

-- No RLS policies: deny by default, service-role only — same as
-- book_requests itself (0039). Every access goes through the API.
alter table book_request_attachments enable row level security;
