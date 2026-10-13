-- 0051_allow_available_to_reserved.sql
-- Releasing a borrow hold (POST /holds/{token}/release) hands the copy to
-- the first student waiting in the reservation queue, the same handoff a
-- return or reshelve does. That copy is 'available' at that point, and the
-- status machine never allowed available -> reserved, so the update raised
-- a check violation after the next student had already been promoted and
-- emailed — leaving them a "ready" reservation on a copy still open to
-- walk-ins. This is 0048's transition list with that one pair added.
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
    ('missing', 'for_reshelving')
  );

  if not is_allowed then
    raise exception 'Illegal book_copies status transition: % -> %', old.status, new.status
      using errcode = '23514';
  end if;

  return new;
end;
$$ language plpgsql;
