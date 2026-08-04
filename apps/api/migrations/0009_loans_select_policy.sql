-- 0009_loans_select_policy.sql
-- loans has had RLS enabled with zero policies since 0006 (deny-by-default,
-- writes only via the service-role client from routers/loans.py). Adding a
-- read policy now so GET /loans can use the same RLS-auto-scopes-by-caller
-- pattern as /reservations and /borrow: a student sees only their own
-- loans, a librarian sees all, with no role branching needed in the route
-- handler. Uses is_librarian() (0008) rather than a raw subquery on
-- profiles, to not reintroduce that recursion bug.

create policy "loans_select_own_or_librarian" on loans
  for select to authenticated
  using (student_id = auth.uid() or is_librarian());
