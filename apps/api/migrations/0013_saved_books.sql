-- 0013_saved_books.sql
-- "Saved" tab (My Library) and the bookmark button on catalog/detail pages
-- were both UI-only before this — a local useState that reset on every
-- navigation, never persisted anywhere. This is the backing table.

create table if not exists saved_books (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  book_id     uuid not null references books(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, book_id)
);

create index if not exists saved_books_user_idx on saved_books (user_id);

alter table saved_books enable row level security;

create policy saved_books_select_own
  on saved_books for select to authenticated
  using (user_id = auth.uid());

create policy saved_books_insert_own
  on saved_books for insert to authenticated
  with check (user_id = auth.uid());

create policy saved_books_delete_own
  on saved_books for delete to authenticated
  using (user_id = auth.uid());
