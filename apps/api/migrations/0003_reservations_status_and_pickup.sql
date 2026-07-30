-- 0003_reservations_status_and_pickup.sql
-- Aligns the reservations schema with the already-built UI (student +
-- librarian reservation pages), which was designed around a 4-state flow
-- this table didn't originally support:
--   pending -> confirmed -> ready (for pickup) -> [picked up / expires]
--   pending/confirmed/ready -> cancelled
-- Also adds pickup_by, which both pages display and sort by but the table
-- never had a column for. No real reservations exist yet (no UI entry
-- point ever created one), so this is a pure schema change, no data to
-- migrate.

alter table reservations drop constraint if exists reservations_status_check;
alter table reservations add constraint reservations_status_check
  check (status in ('pending', 'confirmed', 'ready', 'cancelled'));

alter table reservations alter column status set default 'pending';

alter table reservations
  add column if not exists pickup_by timestamptz;

-- The librarian reservation queue needs to show which student made each
-- request, which means embedding `profiles` alongside `books` in the
-- /reservations response. Additive only — doesn't touch/replace whatever
-- profiles policies already exist, just widens read access for librarians.
drop policy if exists "profiles_select_librarian" on profiles;
create policy "profiles_select_librarian" on profiles
  for select to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'librarian'));
