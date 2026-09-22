-- 0039_book_requests.sql
-- Faculty-only "request a book" flow — the Reports > Requests tab
-- (app/librarian/reports/page.tsx's RequestsPlaceholder) has shown a
-- "coming soon" placeholder since it was built; this is the underlying
-- feature. Gated to role = 'faculty' at the API layer (require_faculty,
-- core/deps.py) — 'faculty' is already a real value in profiles.role
-- (assigned at signup by the email-pattern trigger; see
-- scripts/reclassify_dlsl_roles.py), so this doesn't need a separate flag.
--
-- No RLS policies: deny by default, service-role (admin client) only —
-- same pattern as support_tickets (0038) and every other librarian-managed
-- table here. Every access (submit, self-view, list, update) goes through
-- the API's own role checks, never straight through PostgREST.
create table if not exists book_requests (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references profiles(id),

  title         text not null,
  author        text,
  isbn          text,
  note          text,

  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'fulfilled')),
  reviewed_by   uuid references profiles(id),
  reviewed_at   timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists book_requests_status_idx on book_requests(status);
create index if not exists book_requests_requester_idx on book_requests(requester_id);

alter table book_requests enable row level security;
