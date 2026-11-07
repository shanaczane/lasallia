-- 0065_profiles_lockdown.sql
-- profiles was created by Supabase's signup flow, so its rules were never in
-- a migration. This records them, and closes two gaps found by reading the
-- live database.
--
-- 1. handle_new_user() used the role from raw_user_meta_data. The person
--    signing up sets that, so anyone could sign up as a librarian. The role
--    now comes only from the email address. Accounts that need another role
--    are changed afterwards with the service role. Existing accounts keep
--    their role.
--
-- 2. anon and authenticated held write grants on profiles and book_copies,
--    including TRUNCATE, which RLS doesn't apply to. Both tables are written
--    only by the API (service role) and by this trigger.
--
-- Safe to run before or after the API deploy: nothing writes these tables
-- with a user's token.
--
-- To undo: re-create the earlier function and grant the privileges back to
-- anon and authenticated. Don't restore the metadata role.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  local_part text := split_part(new.email, '@', 1);
  guessed_role text;
begin
  guessed_role := case
    when lower(new.email) not like '%@dlsl.edu.ph' then 'guest'
    -- Faculty: dots, no underscore, e.g. khatrina.joice.gonzales@dlsl.edu.ph
    when position('.' in local_part) > 0 and position('_' in local_part) = 0 then 'faculty'
    -- Student: underscore, e.g. shana_czane_cruzat@dlsl.edu.ph, and the
    -- fallback for anything ambiguous.
    else 'student'
  end;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    guessed_role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Already on in the live database; recorded here. book_copies has no
-- policies on purpose: the API reads it with the service role.
alter table profiles enable row level security;
alter table book_copies enable row level security;

drop policy if exists "users: select own profile" on profiles;
create policy "users: select own profile" on profiles
  for select
  using (auth.uid() = id);

revoke insert, update, delete, truncate, references, trigger
  on profiles, book_copies
  from anon, authenticated;

notify pgrst, 'reload schema';
