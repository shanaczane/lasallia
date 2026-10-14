-- 0054_loan_hold_token.sql
-- The soft_holds token a kiosk loan was confirmed with. confirm_loan
-- deletes the hold once the loan exists, so a retry of the same confirm
-- (the phone timed out waiting for the first reply, which still went
-- through) used to get "hold is gone" and look like a failure. With the
-- token kept on the loan, a repeat confirm returns the loan it already
-- made instead.
--
-- Null for desk-side (librarian-assisted) loans, which never had a hold.
-- Unique so two confirms racing on the same token can't both create a loan.
alter table loans add column if not exists hold_token text;

create unique index if not exists loans_hold_token_key
  on loans (hold_token) where hold_token is not null;
