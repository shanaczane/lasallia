-- 0061_librarian_profiles.sql
-- The LRC keeps one shared librarian login, but each librarian now has a
-- profile of their own. After signing in, a librarian picks their profile
-- and enters a PIN or taps their staff ID; the API then issues a short-lived
-- signed token that every librarian write action must present.
--
-- RLS is on with no policies: deny by default, service-role only, same
-- pattern as weeding_events. PIN hashes and card ids never reach a browser;
-- the API returns only what the picker and Manage Librarians need.
--
-- staff_rfid_uid is separate from profiles.rfid_uid, which identifies
-- borrowers.
--
-- Additive. To undo:
--   drop function if exists record_librarian_sign_in_failure(uuid, int, int);
--   drop table if exists librarian_profiles;
--   alter table library_settings drop column if exists librarian_idle_timeout_minutes;

create table if not exists librarian_profiles (
  id               uuid primary key default gen_random_uuid(),
  full_name        text not null check (char_length(btrim(full_name)) between 1 and 120),
  pin_hash         text not null,
  staff_rfid_uid   text unique,
  is_active        boolean not null default true,
  failed_attempts  int not null default 0 check (failed_attempts >= 0),
  locked_until     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table librarian_profiles enable row level security;

revoke all on librarian_profiles from anon, authenticated;

drop trigger if exists librarian_profiles_set_updated_at on librarian_profiles;
create trigger librarian_profiles_set_updated_at
  before update on librarian_profiles
  for each row execute function set_updated_at();

-- One wrong PIN or tap, counted in a single statement so two attempts at
-- once can't both read the same count. Reaching the limit locks the profile
-- and restarts the count for after the lock.
create or replace function record_librarian_sign_in_failure(
  p_profile_id   uuid,
  p_max_attempts int,
  p_lock_seconds int
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_failed int;
  v_locked timestamptz;
begin
  update librarian_profiles p
  set failed_attempts = case when p.failed_attempts + 1 >= p_max_attempts then 0 else p.failed_attempts + 1 end,
      locked_until    = case when p.failed_attempts + 1 >= p_max_attempts
                             then now() + make_interval(secs => p_lock_seconds)
                             else p.locked_until end
  where p.id = p_profile_id
  returning p.failed_attempts, p.locked_until into v_failed, v_locked;

  return jsonb_build_object('failed_attempts', v_failed, 'locked_until', v_locked);
end;
$$;

revoke all on function record_librarian_sign_in_failure(uuid, int, int) from public;
grant execute on function record_librarian_sign_in_failure(uuid, int, int) to service_role;

-- With no activity for this long, the librarian area returns to the profile
-- picker. Also the lifetime of the active-profile token.
alter table library_settings
  add column if not exists librarian_idle_timeout_minutes int not null default 15
    check (librarian_idle_timeout_minutes between 5 and 120);

notify pgrst, 'reload schema';
