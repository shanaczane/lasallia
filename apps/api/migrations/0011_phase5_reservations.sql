-- 0011_phase5_reservations.sql
-- Phase 5 of the kiosk plan: links a reservation to the specific copy
-- assigned to it, and simplifies the status flow to match how fulfillment
-- actually works now — automatic (Phase 4's return handler / the expiry
-- sweep in routers/reservations.py), not a manual librarian pre-approval.

alter table reservations
  add column if not exists book_copy_id uuid references book_copies(id),
  add column if not exists fulfilled_at timestamptz;

-- Drops 'confirmed' (no longer meaningful — nothing manually pre-approves
-- a reservation anymore) and adds 'fulfilled' (picked up, became a loan)
-- and 'expired' (pickup_by passed, unclaimed). Dev-data schema — any
-- existing 'confirmed' rows are a manual cleanup, not a migration concern.
alter table reservations drop constraint if exists reservations_status_check;
alter table reservations add constraint reservations_status_check
  check (status in ('pending', 'ready', 'fulfilled', 'cancelled', 'expired'));
