-- 0052_loan_fine_breakdown.sql
-- loans.fine_amount is the combined total charged at return, so a student's
-- history card had to guess whether a fine was for lateness or damage —
-- and guessed wrong when a book came back a few hours late (or late only
-- over closed days) with no late fine charged. return_loan now records
-- each part separately. Null on loans returned before this migration;
-- the frontend falls back to inferring the type for those.
alter table loans
  add column if not exists overdue_fine_amount numeric(10, 2),
  add column if not exists damage_fine_amount numeric(10, 2);
