-- 0033_books_availability_realtime.sql
-- Realtime catalog availability. book_copies is deny-by-default (RLS on, no
-- policy) so Supabase Realtime can't stream it to browsers — and shouldn't:
-- its rows carry accession_number and shelf_location, which routers/books.py
-- deliberately keeps off the public API. books IS anon-readable
-- (books_select_all), so a trigger bumps books.availability_changed_at when
-- any of a book's copies changes status, and browsers subscribe to that.
-- The browser only learns "this book changed"; it then refetches through
-- GET /books, so _apply_real_availability stays the single source of truth.

alter table books add column if not exists availability_changed_at timestamptz not null default now();

create or replace function bump_book_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update books set availability_changed_at = now() where id = old.book_id;
    return old;
  end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    update books set availability_changed_at = now() where id = new.book_id;
  end if;
  return new;
end;
$$;

drop trigger if exists book_copies_bump_availability on book_copies;
create trigger book_copies_bump_availability
  after insert or update of status or delete on book_copies
  for each row execute function bump_book_availability();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'books'
  ) then
    alter publication supabase_realtime add table books;
  end if;
end $$;
