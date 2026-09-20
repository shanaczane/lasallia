-- 0035_book_catalog_fields.sql
-- The librarian Add/Edit Book form (BookFormModal) has always collected these
-- fields, but books only ever gained the columns earlier phases actually
-- needed — the rest were silently dropped on save. Adds the missing columns
-- so POST/PATCH /books can persist the whole form instead of just local
-- React state (see the "editing books doesn't save" fix).

alter table books
  add column if not exists subtitle text,
  add column if not exists alternate_title text,
  add column if not exists lccn text,
  add column if not exists issn text,
  add column if not exists edition text,
  add column if not exists series_title text,
  add column if not exists series_volume text,
  add column if not exists place_of_publication text,
  add column if not exists physical_extent text,
  add column if not exists physical_illustrations text,
  add column if not exists physical_dimensions text,
  add column if not exists purchase_price numeric(10,2),
  add column if not exists date_acquired date,
  add column if not exists circulation_type text,
  add column if not exists vendor text,
  add column if not exists funding_source text,
  add column if not exists notes text;

alter table books drop constraint if exists books_funding_source_check;
alter table books add constraint books_funding_source_check
  check (funding_source is null or funding_source in ('purchased', 'donated', 'grant'));
