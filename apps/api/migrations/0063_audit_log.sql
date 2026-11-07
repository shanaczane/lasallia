-- 0063_audit_log.sql
-- Who did what under the shared librarian login. Rows name the librarian
-- profile that was active, with a copy of the name as it was then.
--
-- Append-only, like weeding_events in 0022, and stricter: triggers refuse
-- update, delete and truncate for every role, including the service role, so
-- the API can't rewrite history either. The API writes it (core/audit.py);
-- librarians can read it.
--
-- Additive. To undo:
--   drop table if exists audit_log;
--   drop function if exists audit_log_is_append_only();

create table if not exists audit_log (
  id                    uuid primary key default gen_random_uuid(),
  librarian_profile_id  uuid not null references librarian_profiles(id) on delete restrict,
  librarian_name        text not null,
  action                text not null,
  entity_type           text not null,
  entity_id             text,
  details               jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now()
);

create index if not exists audit_log_created_idx on audit_log (created_at desc);
create index if not exists audit_log_profile_idx on audit_log (librarian_profile_id, created_at desc);
create index if not exists audit_log_action_idx on audit_log (action, created_at desc);

create or replace function audit_log_is_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

drop trigger if exists audit_log_no_change on audit_log;
create trigger audit_log_no_change
  before update or delete on audit_log
  for each row execute function audit_log_is_append_only();

drop trigger if exists audit_log_no_truncate on audit_log;
create trigger audit_log_no_truncate
  before truncate on audit_log
  for each statement execute function audit_log_is_append_only();

alter table audit_log enable row level security;

revoke all on audit_log from anon, authenticated;
grant select on audit_log to authenticated;

drop policy if exists audit_log_select_librarian on audit_log;
create policy audit_log_select_librarian on audit_log
  for select to authenticated
  using (is_librarian());

notify pgrst, 'reload schema';
