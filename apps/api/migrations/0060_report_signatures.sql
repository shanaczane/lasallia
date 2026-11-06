-- 0060_report_signatures.sql
-- Job titles for the signature lines on exported reports (Prepared by,
-- Noted by, Approved by), editable in Settings. The names are typed at
-- export time and never stored.
--
-- The defaults are PLACEHOLDERS until the library confirms the titles. They
-- must match core/report_export/layout.py's PLACEHOLDER_TITLES, which is how
-- the export dialog knows a title hasn't been confirmed yet.
--
-- Additive. To undo:
--   alter table library_settings
--     drop column if exists report_prepared_by_title,
--     drop column if exists report_noted_by_title,
--     drop column if exists report_approved_by_title;

alter table library_settings
  add column if not exists report_prepared_by_title text not null default 'Librarian'
    check (char_length(btrim(report_prepared_by_title)) between 1 and 120),
  add column if not exists report_noted_by_title    text not null default 'Head Librarian'
    check (char_length(btrim(report_noted_by_title)) between 1 and 120),
  add column if not exists report_approved_by_title text not null default 'Director, Learning Resource Center'
    check (char_length(btrim(report_approved_by_title)) between 1 and 120);

notify pgrst, 'reload schema';
