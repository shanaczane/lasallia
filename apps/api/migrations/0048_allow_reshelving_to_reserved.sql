-- 0048_allow_reshelving_to_reserved.sql
-- POST /loans/reshelve re-checks the reservation queue before putting a
-- copy back on the shelf: if someone reserved the title while the copy sat
-- in for_reshelving, the copy goes straight to 'reserved' for them instead
-- of 'available'. The status machine from 0004 never allowed
-- for_reshelving -> reserved, so that update raised a check violation and
-- the reshelving scan failed with a 500 for any title with a pending
-- reservation. This is the same transition list with that one pair added.
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
    ('missing', 'for_reshelving')
  );

  if not is_allowed then
    raise exception 'Illegal book_copies status transition: % -> %', old.status, new.status
      using errcode = '23514';
  end if;

  return new;
end;
$$ language plpgsql;
