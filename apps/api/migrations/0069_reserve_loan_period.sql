-- 0069_reserve_loan_period.sql
-- How long Reserve, Story book and Bible items go out for. The LRC manual
-- gives their fine but not a loan length, so this starts at 7 days, the same
-- as now, and the librarian can change it in Settings.
--
-- Additive. To undo: alter table library_settings drop column reserve_loan_period_days;

alter table library_settings
  add column if not exists reserve_loan_period_days integer not null default 7
    check (reserve_loan_period_days >= 1);

notify pgrst, 'reload schema';
