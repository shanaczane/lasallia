-- 0049_release_copy_on_record_delete.sql
-- A copy's status is only ever moved off on_loan/reserved by the app when
-- it closes the loan or reservation that put it there (return, pickup,
-- expiry, cancellation). Deleting that row outright skipped all of it:
-- loans.student_id and reservations.user_id cascade from profiles, so
-- removing an account (or a test script's own cleanup) wiped the record
-- and left its copy stuck on 'on_loan' / 'reserved' with no borrower and
-- no hold, unborrowable until someone edited the row by hand.
--
-- These triggers send the copy to 'for_reshelving' whenever the row
-- holding it is deleted. That is the same landing spot a normal return
-- uses, so the reshelving scan still re-checks the reservation queue
-- before the copy goes back on the shelf.

create or replace function release_copy_after_loan_delete()
returns trigger as $$
begin
  if old.status in ('active', 'overdue') then
    update book_copies
       set status = 'for_reshelving'
     where id = old.book_copy_id
       and status in ('on_loan', 'overdue')
       and not exists (
         select 1 from loans
          where book_copy_id = old.book_copy_id
            and status in ('active', 'overdue')
       )
       and not exists (
         select 1 from in_house_loans
          where book_copy_id = old.book_copy_id
            and status <> 'returned'
       );
  end if;
  return old;
end;
$$ language plpgsql;

drop trigger if exists loans_release_copy_on_delete on loans;
create trigger loans_release_copy_on_delete
  after delete on loans
  for each row execute function release_copy_after_loan_delete();

create or replace function release_copy_after_reservation_delete()
returns trigger as $$
begin
  if old.status = 'ready' and old.book_copy_id is not null then
    update book_copies
       set status = 'for_reshelving'
     where id = old.book_copy_id
       and status = 'reserved'
       and not exists (
         select 1 from reservations
          where book_copy_id = old.book_copy_id
            and status = 'ready'
       );
  end if;
  return old;
end;
$$ language plpgsql;

drop trigger if exists reservations_release_copy_on_delete on reservations;
create trigger reservations_release_copy_on_delete
  after delete on reservations
  for each row execute function release_copy_after_reservation_delete();
