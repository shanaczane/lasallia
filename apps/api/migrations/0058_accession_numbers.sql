-- 0058_accession_numbers.sql
-- Lasallia assigns accession numbers to new copies from a counter per
-- prefix, and book_copies becomes the only record of copies.
--
--  - accession_counters: next number per prefix (T, GS). Change a starting
--    number by updating its row; there is no UI for it.
--  - next_accession_numbers(): hands out numbers under a row lock, skipping
--    any number a copy (or a legacy books.accession_no) already has.
--  - A copy inserted with a number at or above its prefix's counter (an
--    import, "Register existing copy", a correction) moves the counter past
--    it. Unknown prefixes and values that aren't letters + digits (e.g.
--    "T45312-C2") are ignored.
--  - create_book_with_copies() / add_book_copies(): book + copies, or a
--    batch of copies, in one transaction.
--  - book_copies.accession_number (and the legacy books.accession_no)
--    can't be changed except through correct_accession_number(), which
--    logs old value, new value, reason, who and when in
--    accession_corrections. Resending the same value is allowed.
--  - books.total_copies / available_copies lose their default, so new books
--    leave them null instead of storing a count nobody maintains.
--
-- Additive apart from the dropped defaults. To undo:
--   drop trigger if exists books_accession_locked on books;
--   drop function if exists books_accession_locked();
--   drop trigger if exists book_copies_accession_locked on book_copies;
--   drop trigger if exists book_copies_accession_counter on book_copies;
--   drop function if exists correct_accession_number(uuid, text, text, uuid);
--   drop function if exists add_book_copies(uuid, text, int);
--   drop function if exists create_book_with_copies(jsonb, text, int);
--   drop function if exists next_accession_numbers(text, int);
--   drop function if exists book_copies_accession_locked();
--   drop function if exists accession_counter_follow();
--   drop index if exists book_copies_accession_normalized_key;
--   drop function if exists normalize_accession(text);
--   drop table if exists accession_corrections;
--   drop table if exists accession_counters;
--   alter table books alter column total_copies set default 1;
--   alter table books alter column available_copies set default 1;

-- ─── Normalizing ────────────────────────────────────────────────────────
-- Same rule as core/accession.py (T0045313 -> T45313), upper-cased.
-- Anything that isn't letters + digits is only trimmed and upper-cased.
create or replace function normalize_accession(value text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(btrim(value), '^([A-Za-z]+)0*([0-9]+)$', '\1\2'));
$$;

-- Blocks "t45000" next to "T45000", or "T045000". The catalog audit found
-- no existing values that collide under this rule.
create unique index if not exists book_copies_accession_normalized_key
  on book_copies (normalize_accession(accession_number));

-- ─── Counters ───────────────────────────────────────────────────────────
create table if not exists accession_counters (
  prefix      text primary key check (prefix ~ '^[A-Z]+$'),
  next_value  bigint not null check (next_value > 0),
  updated_at  timestamptz not null default now()
);

alter table accession_counters enable row level security;

insert into accession_counters (prefix, next_value) values
  ('T', 46646),
  ('GS', 676)
on conflict (prefix) do nothing;

-- Returns p_count unused numbers in order and moves the counter past them.
-- The row lock makes concurrent callers queue, so no number is handed out
-- twice; it's held until the caller's transaction ends.
create or replace function next_accession_numbers(p_prefix text, p_count int)
returns setof text
language plpgsql
as $$
declare
  v_prefix text := upper(btrim(p_prefix));
  v_next bigint;
  v_found int := 0;
  v_candidate text;
begin
  if p_count is null or p_count < 1 or p_count > 50 then
    raise exception 'Number of copies must be between 1 and 50' using errcode = '22023';
  end if;

  select next_value into v_next from accession_counters where prefix = v_prefix for update;
  if not found then
    raise exception 'Unknown accession prefix "%"', p_prefix using errcode = '22023';
  end if;

  while v_found < p_count loop
    v_candidate := v_prefix || v_next;
    if not exists (select 1 from book_copies where normalize_accession(accession_number) = v_candidate)
       and not exists (select 1 from books where normalize_accession(accession_no) = v_candidate) then
      v_found := v_found + 1;
      return next v_candidate;
    end if;
    v_next := v_next + 1;
  end loop;

  update accession_counters set next_value = v_next, updated_at = now() where prefix = v_prefix;
end;
$$;

-- Moves a prefix's counter past a copy's number when that number is at or
-- above it. Ignores unknown prefixes and nonstandard values.
create or replace function accession_counter_follow()
returns trigger
language plpgsql
as $$
declare
  parts text[];
  v_value bigint;
begin
  parts := regexp_match(new.accession_number, '^\s*([A-Za-z]+)0*([0-9]{1,15})\s*$');
  if parts is null then
    return new;
  end if;
  v_value := parts[2]::bigint;
  update accession_counters
     set next_value = v_value + 1, updated_at = now()
   where prefix = upper(parts[1]) and next_value <= v_value;
  return new;
end;
$$;

drop trigger if exists book_copies_accession_counter on book_copies;
create trigger book_copies_accession_counter
  after insert or update of accession_number on book_copies
  for each row execute function accession_counter_follow();

-- ─── Read-only accession numbers ────────────────────────────────────────
create or replace function book_copies_accession_locked()
returns trigger
language plpgsql
as $$
begin
  if new.accession_number is distinct from old.accession_number
     and coalesce(current_setting('lasallia.accession_correction', true), '') <> 'on' then
    raise exception 'Accession numbers can''t be changed directly. Use "Correct accession number", which records a reason.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists book_copies_accession_locked on book_copies;
create trigger book_copies_accession_locked
  before update of accession_number on book_copies
  for each row execute function book_copies_accession_locked();

-- The legacy books.accession_no gets the same lock. The API before this
-- migration wrote it before touching the copy, so without this an edit that
-- changed the number (or typed one onto a book that had none) would save it
-- on books and then fail on the copy, leaving a number that matches no copy.
-- Resending the same value, as every edit from the old form does, passes.
create or replace function books_accession_locked()
returns trigger
language plpgsql
as $$
begin
  if new.accession_no is distinct from old.accession_no
     and coalesce(current_setting('lasallia.accession_correction', true), '') <> 'on' then
    raise exception 'Accession numbers can''t be changed on the book. Use "Correct accession number" on the copy.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists books_accession_locked on books;
create trigger books_accession_locked
  before update of accession_no on books
  for each row execute function books_accession_locked();

-- ─── Book + copies in one transaction ───────────────────────────────────
-- p_book is a books row as JSON. Only keys that are real columns are
-- inserted, so columns left out keep their defaults.
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

  insert into book_copies (book_id, accession_number, status, shelf_location)
  select v_book.id, n, 'available', v_book.shelf_location
    from unnest(v_numbers) with ordinality as t(n, ord)
   order by ord;

  return jsonb_build_object('book', to_jsonb(v_book), 'accession_numbers', to_jsonb(v_numbers));
end;
$$;

-- New copies with automatic numbers for an existing, non-archived book.
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

  insert into book_copies (book_id, accession_number, status, shelf_location)
  select v_book.id, n, 'available', v_book.shelf_location
    from unnest(v_numbers) with ordinality as t(n, ord)
   order by ord;

  return v_numbers;
end;
$$;

-- ─── Corrections ────────────────────────────────────────────────────────
create table if not exists accession_corrections (
  id            uuid primary key default gen_random_uuid(),
  book_copy_id  uuid references book_copies(id) on delete set null,
  book_id       uuid references books(id) on delete set null,
  old_value     text not null,
  new_value     text not null,
  reason        text not null check (btrim(reason) <> ''),
  corrected_by  uuid references profiles(id) on delete set null,
  corrected_at  timestamptz not null default now()
);

alter table accession_corrections enable row level security;

create index if not exists accession_corrections_copy_idx on accession_corrections (book_copy_id, corrected_at desc);

-- Same format and uniqueness rules as a new number. Also moves a legacy
-- books.accession_no that mirrored the old number, so conflict checks and
-- import matching don't keep seeing it.
create or replace function correct_accession_number(p_copy_id uuid, p_new text, p_reason text, p_staff uuid)
returns accession_corrections
language plpgsql
as $$
declare
  v_copy book_copies;
  v_new text := normalize_accession(p_new);
  v_row accession_corrections;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to correct an accession number' using errcode = '22023';
  end if;
  if v_new is null or v_new !~ '^[A-Z]+[0-9]+$' then
    raise exception 'Accession numbers are letters followed by digits, like T46646' using errcode = '22023';
  end if;

  select * into v_copy from book_copies where id = p_copy_id for update;
  if not found then
    raise exception 'Copy not found' using errcode = 'P0002';
  end if;
  if normalize_accession(v_copy.accession_number) = v_new then
    raise exception 'That is already this copy''s accession number' using errcode = '22023';
  end if;
  if exists (select 1 from book_copies where normalize_accession(accession_number) = v_new and id <> p_copy_id)
     or exists (select 1 from books where normalize_accession(accession_no) = v_new and id <> v_copy.book_id) then
    raise exception 'Accession number % is already in use', v_new using errcode = '23505';
  end if;

  -- Both locks let this through only while the switch is on.
  perform set_config('lasallia.accession_correction', 'on', true);
  update book_copies set accession_number = v_new where id = p_copy_id;
  update books set accession_no = v_new
   where id = v_copy.book_id
     and normalize_accession(accession_no) = normalize_accession(v_copy.accession_number);
  perform set_config('lasallia.accession_correction', 'off', true);

  insert into accession_corrections (book_copy_id, book_id, old_value, new_value, reason, corrected_by)
  values (p_copy_id, v_copy.book_id, v_copy.accession_number, v_new, btrim(p_reason), p_staff)
  returning * into v_row;

  return v_row;
end;
$$;

-- ─── Legacy count columns ───────────────────────────────────────────────
alter table books alter column total_copies drop default;
alter table books alter column available_copies drop default;

-- ─── Service role only, like the other functions ────────────────────────
revoke execute on function next_accession_numbers(text, int) from public, anon, authenticated;
revoke execute on function create_book_with_copies(jsonb, text, int) from public, anon, authenticated;
revoke execute on function add_book_copies(uuid, text, int) from public, anon, authenticated;
revoke execute on function correct_accession_number(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function next_accession_numbers(text, int) to service_role;
grant execute on function create_book_with_copies(jsonb, text, int) to service_role;
grant execute on function add_book_copies(uuid, text, int) to service_role;
grant execute on function correct_accession_number(uuid, text, text, uuid) to service_role;

-- So the API can call the new functions right away.
notify pgrst, 'reload schema';
