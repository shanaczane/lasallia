-- 0040_allow_faculty_role.sql
-- profiles.role's check constraint (profiles_role_check) never included
-- 'faculty', even though the app's Role type has treated it as a real role
-- since 'faculty' was added (schemas/auth.py, packages/types/user.ts,
-- core/deps.py's require_faculty). This silently broke two things: the
-- handle_new_user() signup trigger errored with a generic "Database error
-- creating new user" for any dot-pattern email (guess_role() in
-- scripts/reclassify_dlsl_roles.py maps those to faculty), and there was no
-- way to manually set an existing account's role to faculty either — same
-- constraint blocked a direct UPDATE just as it blocked the trigger's INSERT.
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('student', 'faculty', 'librarian', 'guest'));
