-- 0055_misplaced_copy_status.sql
-- Inventory module: a real 'misplaced' copy status — the copy is in the
-- building, just on the wrong shelf (found by an inventory scan somewhere
-- other than where its book belongs).
--
-- The book-level books.status already had a value named 'misplaced', but it
-- meant "every copy is lost/missing/damaged" and the UI labelled it
-- "Missing" (routers/books.py's _derive_status). Renamed to 'missing' here,
-- and the book-level 'misplaced' now means what it says: no copy is
-- available, and at least one is in the building on the wrong shelf.

-- ─── book_copies.status: add 'misplaced' ───────────────────────────────
alter table book_copies drop constraint if exists book_copies_status_check;
alter table book_copies add constraint book_copies_status_check
  check (status in (
    'available', 'on_loan', 'for_reshelving', 'reserved',
    'overdue', 'lost', 'damaged', 'missing', 'misplaced'
  ));

-- 0051's transition list plus the misplaced moves:
--   available / for_reshelving -> misplaced   (scanned on the wrong shelf)
--   misplaced -> for_reshelving                (taken back to its shelf; the
--                                               usual reshelving scan then
--                                               makes it available — never
--                                               straight to available)
--   misplaced -> on_loan                       (borrowed at the desk — the
--                                               kiosk only claims available)
--   misplaced -> missing / lost / damaged      (same side states as any copy)
create or replace function book_copies_check_transition()
returns trigger as $$
declare
  is_allowed boolean;
begin
  if new.status = old.status then
    return new;
  end if;

  is_allowed := (old.status, new.status) in (
    ('available', 'on_loan'),
    ('available', 'reserved'),
    ('on_loan', 'for_reshelving'),
    ('on_loan', 'reserved'),
    ('for_reshelving', 'available'),
    ('for_reshelving', 'reserved'),
    ('reserved', 'on_loan'),
    ('reserved', 'for_reshelving'),
    ('available', 'overdue'), ('on_loan', 'overdue'), ('reserved', 'overdue'), ('for_reshelving', 'overdue'),
    ('available', 'lost'), ('on_loan', 'lost'), ('reserved', 'lost'), ('for_reshelving', 'lost'),
    ('available', 'damaged'), ('on_loan', 'damaged'), ('reserved', 'damaged'), ('for_reshelving', 'damaged'),
    ('available', 'missing'), ('on_loan', 'missing'), ('reserved', 'missing'), ('for_reshelving', 'missing'),
    ('overdue', 'for_reshelving'), ('overdue', 'on_loan'),
    ('lost', 'for_reshelving'),
    ('damaged', 'for_reshelving'),
    ('missing', 'for_reshelving'),
    ('available', 'misplaced'), ('for_reshelving', 'misplaced'),
    ('misplaced', 'for_reshelving'), ('misplaced', 'on_loan'),
    ('misplaced', 'missing'), ('misplaced', 'lost'), ('misplaced', 'damaged')
  );

  if not is_allowed then
    raise exception 'Illegal book_copies status transition: % -> %', old.status, new.status
      using errcode = '23514';
  end if;

  return new;
end;
$$ language plpgsql;

-- ─── books.status: old 'misplaced' -> 'missing', new 'misplaced' ───────
alter table books drop constraint if exists books_status_check;
update books set status = 'missing' where status = 'misplaced';
alter table books add constraint books_status_check
  check (status in ('available', 'borrowed', 'reserved', 'missing', 'misplaced'));
