-- 0050_copy_status_requires_holder.sql
-- A copy can only be 'on_loan'/'overdue' while a loan or in-house loan is
-- open on it, and only 'reserved' while a ready reservation points at it.
-- Without this, setting the status by hand (Supabase table editor, a
-- one-off script) produced a copy nobody could borrow and no screen could
-- explain: "On Loan" with no borrower, "Reserved" with no one waiting.
--
-- Every app flow already writes the loan/reservation first and the copy
-- status second (core/loans.py create_loan_and_notify, routers/inhouse.py,
-- promote_next_reservation before any 'reserved' update), so they pass.
--
-- Also extends 0049's release-on-delete to in-house loans.

create or replace function book_copies_require_holder()
returns trigger as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status in ('on_loan', 'overdue') and not exists (
       select 1 from loans
        where book_copy_id = new.id and status in ('active', 'overdue')
     ) and not exists (
       select 1 from in_house_loans
        where book_copy_id = new.id and status <> 'returned'
     ) then
    raise exception 'Copy % can''t be marked % without an open loan on it — borrow it through Borrow & Return instead', new.accession_number, new.status
      using errcode = '23514';
  end if;

  if new.status = 'reserved' and not exists (
       select 1 from reservations
        where book_copy_id = new.id and status = 'ready'
     ) then
    raise exception 'Copy % can''t be marked reserved without a ready reservation on it', new.accession_number
      using errcode = '23514';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists book_copies_require_holder on book_copies;
create trigger book_copies_require_holder
  before update on book_copies
  for each row execute function book_copies_require_holder();

create or replace function release_copy_after_in_house_loan_delete()
returns trigger as $$
begin
  if old.status <> 'returned' then
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

drop trigger if exists in_house_loans_release_copy_on_delete on in_house_loans;
create trigger in_house_loans_release_copy_on_delete
  after delete on in_house_loans
  for each row execute function release_copy_after_in_house_loan_delete();
