-- 0008_fix_profiles_rls_recursion.sql
-- Fixes "infinite recursion detected in policy for relation profiles".
--
-- Root cause: 0003 added profiles_select_librarian, a policy ON profiles
-- that itself queries profiles ("...exists (select 1 from profiles p
-- where p.id = auth.uid() and p.role = 'librarian')"). Evaluating that
-- subquery re-triggers profiles' own RLS — including this same policy —
-- which recurses. Every OTHER policy that checked the caller's role via
-- "exists (select 1 from profiles where id = auth.uid() and role =
-- 'librarian')" (books, borrow_transactions, reservations, chatbot_logs)
-- has the identical latent bug for the same reason: that subquery also
-- touches profiles, which now recurses through profiles_select_librarian.
--
-- Fix: a SECURITY DEFINER function bypasses RLS on the table it queries
-- (it runs as its owner, not the calling role), so checking "is this
-- caller a librarian" through it never re-enters profiles' own RLS. This
-- is Postgres/Supabase's standard, documented fix for self-referential
-- RLS policies.

create or replace function is_librarian()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'librarian'
  );
$$;

revoke all on function is_librarian() from public;
grant execute on function is_librarian() to anon, authenticated, service_role;

-- ─── profiles ───────────────────────────────────────────────────────────
drop policy if exists "profiles_select_librarian" on profiles;
create policy "profiles_select_librarian" on profiles
  for select to authenticated
  using (is_librarian());

-- ─── books ──────────────────────────────────────────────────────────────
drop policy if exists "books_write_librarian" on books;
create policy "books_write_librarian" on books
  for insert to authenticated
  with check (is_librarian());

drop policy if exists "books_update_librarian" on books;
create policy "books_update_librarian" on books
  for update to authenticated
  using (is_librarian())
  with check (is_librarian());

drop policy if exists "books_delete_librarian" on books;
create policy "books_delete_librarian" on books
  for delete to authenticated
  using (is_librarian());

-- ─── borrow_transactions ────────────────────────────────────────────────
drop policy if exists "borrow_tx_select_own_or_librarian" on borrow_transactions;
create policy "borrow_tx_select_own_or_librarian" on borrow_transactions
  for select to authenticated
  using (user_id = auth.uid() or is_librarian());

drop policy if exists "borrow_tx_write_librarian" on borrow_transactions;
create policy "borrow_tx_write_librarian" on borrow_transactions
  for insert to authenticated
  with check (is_librarian());

drop policy if exists "borrow_tx_update_librarian" on borrow_transactions;
create policy "borrow_tx_update_librarian" on borrow_transactions
  for update to authenticated
  using (is_librarian())
  with check (is_librarian());

-- ─── reservations ───────────────────────────────────────────────────────
drop policy if exists "reservations_select_own_or_librarian" on reservations;
create policy "reservations_select_own_or_librarian" on reservations
  for select to authenticated
  using (user_id = auth.uid() or is_librarian());

drop policy if exists "reservations_update_own_or_librarian" on reservations;
create policy "reservations_update_own_or_librarian" on reservations
  for update to authenticated
  using (user_id = auth.uid() or is_librarian())
  with check (user_id = auth.uid() or is_librarian());

-- ─── chatbot_logs ───────────────────────────────────────────────────────
drop policy if exists "chatbot_logs_select_own_or_librarian" on chatbot_logs;
create policy "chatbot_logs_select_own_or_librarian" on chatbot_logs
  for select to authenticated
  using (user_id = auth.uid() or is_librarian());
