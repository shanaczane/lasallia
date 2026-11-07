-- 0062_api_only_writes.sql
-- Librarian writes, and reservation changes by anyone, now go only through
-- the API. With the shared librarian token and the public anon key, these
-- tables could be written directly, skipping the active-profile check and the
-- audit log. A student could also change any column of their own reservation,
-- such as its status.
--
-- The API writes with the service role, which RLS doesn't apply to. Reads are
-- unchanged, except that librarians keep only read access to in_house_loans.
--
-- Deploy the API before running this: older API code cancels and creates
-- reservations with the user's token.
--
-- Additive in effect. To undo, re-create the policies from 0008 and 0012 and
-- grant insert, update, delete on these tables back to authenticated.

drop policy if exists "books_write_librarian" on books;
drop policy if exists "books_update_librarian" on books;
drop policy if exists "books_delete_librarian" on books;

drop policy if exists "borrow_tx_write_librarian" on borrow_transactions;
drop policy if exists "borrow_tx_update_librarian" on borrow_transactions;

drop policy if exists "reservations_insert_own" on reservations;
drop policy if exists "reservations_update_own_or_librarian" on reservations;

drop policy if exists library_calendar_write_librarian on library_calendar;

drop policy if exists in_house_loans_all_librarian on in_house_loans;
drop policy if exists in_house_loans_select_librarian on in_house_loans;
create policy in_house_loans_select_librarian on in_house_loans
  for select to authenticated
  using (is_librarian());

-- Also refused at the table level, so a policy added later can't quietly
-- reopen these.
revoke insert, update, delete, truncate
  on books, borrow_transactions, reservations, library_calendar, in_house_loans
  from anon, authenticated;

notify pgrst, 'reload schema';
