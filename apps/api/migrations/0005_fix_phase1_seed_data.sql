-- 0005_fix_phase1_seed_data.sql
-- Corrects a bug in 0004's seed data: the "zero available copies" pick
-- used `offset 1` assuming one row per book, but by that point in the
-- script the multi-copy book already had 2 rows, so `offset 1` landed on
-- that same book's second copy instead of a different book. Result: one
-- book had two copies (neither on loan) and no book demonstrated "zero
-- available" at all.

-- Put the multi-copy book's copies back to a clean state (this is a
-- legal for_reshelving -> available transition).
update book_copies set status = 'available'
where accession_number = 'T45312-C2' and status = 'for_reshelving';

-- Mark a genuinely different title's only copy on loan.
update book_copies set status = 'on_loan'
where id = (
  select bc.id
  from book_copies bc
  join books b on b.id = bc.book_id
  where b.id <> (
    select book_id from book_copies where accession_number = 'T45312-C2'
  )
  and bc.status = 'available'
  order by b.title
  limit 1
);
