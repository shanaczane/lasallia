-- 0059_copy_origin.sql
-- Records how each copy got into Lasallia, so "Export new books" can list
-- only copies Lasallia added, and not ones it learned about from the
-- library's own records.
--
--   assigned    numbered by Lasallia: Add Book or Add copies
--               (create_book_with_copies / add_book_copies)
--   registered  "Register existing copy": a copy that already had a
--               printed number
--   imported    the catalog import (Excel or MARC)
--   null        before this migration, or any other path (the seed and
--               backfill scripts, ensure_initial_copy's copy for a legacy
--               books.accession_no, an insert in the SQL editor). Never
--               exported.
--
-- Correcting an accession number doesn't touch origin.
--
-- Needs 0058_accession_numbers.sql (it replaces two of its functions).
-- Additive: existing rows keep origin = null. To undo, re-run the
-- create_book_with_copies and add_book_copies definitions from
-- 0058_accession_numbers.sql, then:
--   drop index if exists book_copies_created_at_idx;
--   alter table book_copies drop column if exists origin;

alter table book_copies
  add column if not exists origin text
    check (origin in ('assigned', 'registered', 'imported'));

-- The export filters copies by when they were created.
create index if not exists book_copies_created_at_idx on book_copies (created_at);

-- Same as 0058, plus origin = 'assigned' on the new copies. create or
-- replace keeps the existing grants (service_role only).
create or replace function create_book_with_copies(p_book jsonb, p_prefix text, p_count int)
returns jsonb
language plpgsql
as $$
declare
  v_cols text;
  v_book books;
  v_numbers text[];
begin
  select string_agg(quote_ident(a.attname), ', ')
    into v_cols
    from pg_attribute a
   where a.attrelid = 'public.books'::regclass
     and a.attnum > 0 and not a.attisdropped
     and p_book ? a.attname;

  if v_cols is null then
    raise exception 'No book fields given' using errcode = '22023';
  end if;

  execute format(
    'insert into books (%1$s) select %1$s from jsonb_populate_record(null::books, $1) returning *',
    v_cols
  ) using p_book into v_book;

  select array_agg(n order by ord) into v_numbers
    from next_accession_numbers(p_prefix, p_count) with ordinality as t(n, ord);

  insert into book_copies (book_id, accession_number, status, shelf_location, origin)
  select v_book.id, n, 'available', v_book.shelf_location, 'assigned'
    from unnest(v_numbers) with ordinality as t(n, ord)
   order by ord;

  return jsonb_build_object('book', to_jsonb(v_book), 'accession_numbers', to_jsonb(v_numbers));
end;
$$;

create or replace function add_book_copies(p_book_id uuid, p_prefix text, p_count int)
returns text[]
language plpgsql
as $$
declare
  v_book books;
  v_numbers text[];
begin
  select * into v_book from books where id = p_book_id for share;
  if not found then
    raise exception 'Book not found' using errcode = 'P0002';
  end if;
  if v_book.archived_at is not null then
    raise exception 'This book is archived. Restore it before adding copies.' using errcode = '22023';
  end if;

  select array_agg(n order by ord) into v_numbers
    from next_accession_numbers(p_prefix, p_count) with ordinality as t(n, ord);

  insert into book_copies (book_id, accession_number, status, shelf_location, origin)
  select v_book.id, n, 'available', v_book.shelf_location, 'assigned'
    from unnest(v_numbers) with ordinality as t(n, ord)
   order by ord;

  return v_numbers;
end;
$$;

notify pgrst, 'reload schema';
