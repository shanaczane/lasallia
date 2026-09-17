-- 0029_librarian_assisted_search_fallback.sql
-- Fallback for desk-side assisted borrow when there's no ID card to tap:
-- the librarian searches for and selects the student directly (see
-- routers/patrons.py's list_patrons ?q= param) — no credential from the
-- student at all. Requires the caller's own librarian JWT, unlike
-- 'rfid'/'manual_login' which are deliberately unauthenticated (see
-- routers/sessions.py's open_session).
alter table station_sessions drop constraint if exists station_sessions_auth_method_check;
alter table station_sessions add constraint station_sessions_auth_method_check
  check (auth_method in ('manual_login', 'rfid', 'librarian_assisted'));
