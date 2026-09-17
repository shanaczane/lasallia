-- 0026_inhouse_receipt_number.sql
-- Guest in-house checkout collects a ₱50.00 fee from non-NOCEI visitors
-- (fee_paid, added in 0012) but never recorded which receipt it was
-- issued against — a librarian could check "fee paid" with nothing to
-- back it up later. Same field, same purpose as the loan-return
-- fine-settlement flow's existing receipt_number (0010, enforced in
-- routers/loans.py), just missing here. Nullable: only required
-- (enforced in routers/inhouse.py) when fee_paid is true;
-- NOCEI-affiliated guests never pay a fee and never need one.
alter table in_house_loans
  add column if not exists receipt_number text;
