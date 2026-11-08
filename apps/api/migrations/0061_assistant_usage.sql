-- 0061_assistant_usage.sql
-- A count of library assistant use that survives deleted chats, for the
-- Library Assistant Usage report. One row per answered question.
--
-- Kiosk chats are deleted when the kiosk session ends, and students can
-- delete their web chats, so chat_sessions/chat_messages can't be counted.
-- Whether a reply came from the rule-based path or the AI was only kept in
-- server memory.
--
-- No message text, no user id and no foreign key to the chat tables:
--   occurred_at   when the reply was sent
--   surface       'kiosk' or 'web'
--   user_type     'guest' (not signed in), 'student', 'faculty' or 'staff'
--                 (a librarian account)
--   answered_by   'rule' or 'ai'; null only on backfilled rows (not recorded)
--   session_key   the chat's random id, only to count chat sessions
--
-- Backfill: the first run copies one row per assistant reply in the chats
-- that still exist, with answered_by = null. Chats deleted before this
-- migration can't be counted, so the report says counts are complete only
-- from the first live-recorded question. Re-running skips the backfill,
-- because it only runs when the table is created.
--
-- Internal table: RLS on with no policies and no grants to anon or
-- authenticated, like station_sessions and chat_sessions. Only the API's
-- service-role client reads and writes it.
--
-- Additive. To undo:
--   drop table if exists assistant_usage;
--   drop index if exists station_sessions_started_idx;

do $$
begin
  if to_regclass('public.assistant_usage') is null then
    create table assistant_usage (
      id           uuid primary key default gen_random_uuid(),
      occurred_at  timestamptz not null default now(),
      surface      text not null check (surface in ('kiosk', 'web')),
      user_type    text not null check (user_type in ('guest', 'student', 'faculty', 'staff')),
      answered_by  text check (answered_by in ('rule', 'ai')),
      session_key  uuid not null
    );

    insert into assistant_usage (occurred_at, surface, user_type, answered_by, session_key)
    select m.created_at,
           s.surface,
           case
             when s.student_id is null then 'guest'
             when p.role = 'librarian' then 'staff'
             when p.role = 'faculty' then 'faculty'
             when p.role = 'student' then 'student'
             else 'guest'
           end,
           null,
           s.id
      from chat_messages m
      join chat_sessions s on s.id = m.session_id
      left join profiles p on p.id = s.student_id
     where m.role = 'assistant';
  end if;
end $$;

create index if not exists assistant_usage_occurred_idx on assistant_usage (occurred_at);

alter table assistant_usage enable row level security;
revoke all on table assistant_usage from anon, authenticated;
grant all on table assistant_usage to service_role;

-- The Library Usage report reads station sessions by start time.
create index if not exists station_sessions_started_idx on station_sessions (started_at);

notify pgrst, 'reload schema';
