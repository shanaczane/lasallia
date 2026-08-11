-- 0016_phase7_chat_sessions.sql
-- Chatbot Phase 7 — chat session/history storage, shared by both
-- surfaces. A kiosk chat session's id is deliberately the SAME value as
-- its station_sessions.id (no FK — they're different tables serving
-- different purposes; forcing one would block deleting either on its own
-- lifecycle). This is what lets ending a station session (idle timeout,
-- Done/Log out, a new tap — routers/sessions.py's existing end_session)
-- also wipe that visit's chat history in the same moment, with no second
-- "end the chat too" call from the frontend to keep in sync.
--
-- No RLS policies — deny by default, same pattern as soft_holds/
-- station_sessions. Every read/write goes through routers/chat.py's
-- service-role client, never a client-direct query.
create table if not exists chat_sessions (
  id          uuid primary key,
  student_id  uuid references profiles(id) on delete set null,
  surface     text not null check (surface in ('kiosk', 'web')),
  started_at  timestamptz not null default now(),
  ended_at    timestamptz
);

alter table chat_sessions enable row level security;

create table if not exists chat_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references chat_sessions(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);

alter table chat_messages enable row level security;

create index if not exists chat_messages_session_idx on chat_messages (session_id, created_at);
create index if not exists chat_sessions_student_idx on chat_sessions (student_id, started_at desc);
