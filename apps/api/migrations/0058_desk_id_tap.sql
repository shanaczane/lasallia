-- 0058_desk_id_tap.sql
-- The borrower's ID tap is used at the desk too: for returns, fine payments
-- and reservation pickups. Each return and payment records how the borrower
-- was identified, so Reports can show it:
--   id_tap        the borrower's own ID was tapped
--   id_tap_other  someone else's ID was tapped (a book returned for a friend)
--   manual        no tap; the librarian found the loan by scan or search
--
-- Pickups need no new column: the checkout's station session already
-- records auth_method ('rfid' for a tap, 'librarian_assisted' otherwise).

alter table loans
  add column if not exists returned_verified_by  text check (returned_verified_by in ('id_tap', 'id_tap_other', 'manual')),
  add column if not exists fine_paid_verified_by text check (fine_paid_verified_by in ('id_tap', 'manual'));

-- Off: a tap is preferred, and the librarian can still search by name.
-- On: fine payments and desk pickups need the borrower's own ID tap.
-- Returns never need one, since the book itself is in hand.
alter table library_settings
  add column if not exists require_id_tap_at_desk boolean not null default false;
