-- 0020_recommendation_events.sql
-- Recommendations plan, Phase 9 — click-through/impression logging.
-- Deny-by-default RLS, service-role only, same reasoning as
-- chat_sessions/station_sessions (migrations/0016, 0004): every read and
-- write goes through the API's admin client (routers/recommendations.py's
-- POST /recommendations/events), never a client-direct query. This is an
-- internal analytics table, not something the frontend ever reads back.

create table if not exists recommendation_events (
  id           bigserial primary key,
  -- Nullable, on delete set null (not cascade) — an event shouldn't
  -- vanish just because the account is later deleted.
  student_id   uuid references profiles(id) on delete set null,
  -- Opaque client-generated token for guest funnel attribution only,
  -- never anything identifying. Null for a logged-in student's events.
  session_id   text,
  is_guest     boolean not null default false,
  book_id      uuid not null references books(id) on delete cascade,
  event_type   text not null check (event_type in ('impression', 'click', 'reserve', 'dismiss')),
  rank         smallint,
  occurred_at  timestamptz not null default now()
);

alter table recommendation_events enable row level security;

create index if not exists recommendation_events_book_idx on recommendation_events (book_id, event_type);
create index if not exists recommendation_events_student_idx on recommendation_events (student_id) where student_id is not null;
