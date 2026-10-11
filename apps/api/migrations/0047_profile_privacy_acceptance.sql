-- 0047_profile_privacy_acceptance.sql
-- First-login Data Privacy Act notice (PrivacyNoticeModal). Null
-- privacy_accepted_at = never accepted, so the notice blocks the dashboard.
-- privacy_notice_version records which text was accepted, so a revised
-- notice can be told apart from (or re-prompted over) an older acceptance.
alter table profiles
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists privacy_notice_version text;
