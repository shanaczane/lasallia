-- 0038_support_tickets.sql
-- Login page's "Contact Support" footer link went from a bare mailto: to a
-- real ticket form — a submitter (often someone locked out, i.e. not signed
-- in) gets a ticket_number back to track status, and librarians get an
-- inbox to work through and resolve. Incident/status-page tracking and a
-- librarian-editable FAQ were explicitly out of scope for this pass (the
-- FAQ stays a static list in the frontend).
--
-- No RLS policies: deny by default, service-role (admin client) only —
-- same pattern as library_settings and every other librarian-only table
-- here. Submission is public (no auth), so it can't be scoped to
-- auth.uid() anyway; every access (submit, track, list, update) goes
-- through the API, never straight through PostgREST.
create sequence if not exists support_ticket_seq;

create table if not exists support_tickets (
  id              uuid primary key default gen_random_uuid(),
  -- Sequential and human-readable (what a submitter reads back and quotes
  -- when following up), not the uuid above. Generated at the database
  -- default rather than in application code so concurrent submissions
  -- can't race each other onto the same number.
  ticket_number   text not null unique default ('LRC-' || lpad(nextval('support_ticket_seq')::text, 6, '0')),

  -- Collected directly on the form, not read off a session — the login
  -- page is exactly where someone locked out of their account ends up,
  -- so this can't assume a signed-in caller.
  name            text not null,
  email           text not null,
  category        text not null default 'other' check (category in ('login', 'technical', 'account', 'other')),
  message         text not null,

  status          text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  -- The librarian's response — surfaced back to the submitter through the
  -- ticket-number+email tracking lookup, since there's no email-sending
  -- infrastructure in this app to notify them any other way.
  resolution_note text,
  handled_by      uuid references profiles(id),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  resolved_at     timestamptz
);

create index if not exists support_tickets_status_idx on support_tickets(status);

alter table support_tickets enable row level security;
