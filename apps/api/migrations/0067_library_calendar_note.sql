-- 0067_library_calendar_note.sql
-- Why a date is closed, for the Library Calendar in Settings ("Christmas Day").
--
-- Additive. To undo: alter table library_calendar drop column if exists note;

alter table library_calendar add column if not exists note text;

notify pgrst, 'reload schema';
