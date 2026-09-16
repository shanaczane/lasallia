-- 0025_library_operating_hours.sql
-- Real, editable weekly Operating Hours for the Settings page's Library
-- Info tab — previously static display-only text ("Not yet editable").
-- Also what core/calendar.py's fine math checks now: a day with no
-- library_calendar override (the norm — nothing has ever populated that
-- table) used to be assumed open 8am-5pm regardless of what the library's
-- real hours actually are. Now it falls back to whichever of these three
-- groups the day's weekday belongs to; null open/close time on a group
-- means closed that day (Sunday, by default) — so no fine accrues for a
-- day the library was never open to begin with.
alter table library_settings
  add column if not exists weekday_open_time   time not null default '07:30',
  add column if not exists weekday_close_time  time not null default '18:00',
  add column if not exists saturday_open_time  time default '08:00',
  add column if not exists saturday_close_time time default '12:00',
  add column if not exists sunday_open_time    time,
  add column if not exists sunday_close_time   time;
