-- 0001_core_schema.sql
-- Core domain tables mirroring packages/types (Book, BorrowTransaction,
-- Reservation, Notification, ChatbotLog), plus RLS policies gated on
-- profiles.role. `profiles` already exists (created by Supabase Auth signup
-- flow) — this migration only extends it with columns UserProfile expects
-- but that aren't there yet.
--
-- Run this once in the Supabase SQL editor (or via `supabase db push` if you
-- switch to the CLI later). Safe to re-run: every statement is guarded with
-- IF NOT EXISTS / OR REPLACE.

create extension if not exists pgcrypto;

-- ─── updated_at helper ──────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ─── profiles: fill in columns UserProfile expects that aren't there yet ─
alter table profiles
  add column if not exists program text,
  add column if not exists year_level int,
  add column if not exists avatar_url text,
  add column if not exists status text not null default 'active'
    check (status in ('active', 'inactive'));

-- ─── books ────────────────────────────────────────────────────────────
create table if not exists books (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  author             text not null,
  isbn               text,
  call_number        text not null,
  category           text not null,
  subject            text,
  shelf_location     text not null,
  floor              text,
  aisle              text,
  status             text not null default 'available'
                       check (status in ('available', 'borrowed', 'reserved', 'misplaced')),
  cover_url          text,
  cover_color        text,
  abstract           text,
  keywords           text[],
  published_year     int,
  publisher          text,
  format             text check (format in ('print', 'digital', 'reference')),
  total_copies       int default 1,
  available_copies   int default 1,
  call_number_start  text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists books_set_updated_at on books;
create trigger books_set_updated_at
  before update on books
  for each row execute function set_updated_at();

create index if not exists books_category_idx on books (category);
create index if not exists books_status_idx on books (status);
create index if not exists books_call_number_idx on books (call_number);

-- ─── borrow_transactions ──────────────────────────────────────────────
create table if not exists borrow_transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  book_id      uuid not null references books(id) on delete restrict,
  borrowed_at  timestamptz not null default now(),
  due_date     timestamptz not null,
  returned_at  timestamptz,
  status       text not null default 'active'
                 check (status in ('active', 'returned', 'overdue')),
  fine_amount  numeric(10, 2)
);

create index if not exists borrow_tx_user_idx on borrow_transactions (user_id);
create index if not exists borrow_tx_book_idx on borrow_transactions (book_id);
create index if not exists borrow_tx_status_idx on borrow_transactions (status);

-- ─── reservations ─────────────────────────────────────────────────────
create table if not exists reservations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  book_id       uuid not null references books(id) on delete cascade,
  requested_at  timestamptz not null default now(),
  confirmed_at  timestamptz,
  cancelled_at  timestamptz,
  status        text not null default 'pending'
                  check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  notes         text
);

create index if not exists reservations_user_idx on reservations (user_id);
create index if not exists reservations_book_idx on reservations (book_id);
create index if not exists reservations_status_idx on reservations (status);

-- ─── notifications ────────────────────────────────────────────────────
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  type        text not null
                check (type in (
                  'due_reminder', 'overdue', 'reservation_confirmed',
                  'reservation_cancelled', 'return_confirmed'
                )),
  title       text not null,
  message     text not null,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now(),
  link        text
);

create index if not exists notifications_user_idx on notifications (user_id);
create index if not exists notifications_unread_idx on notifications (user_id, is_read) where is_read = false;

-- ─── chatbot_logs ─────────────────────────────────────────────────────
-- user_id is nullable: guests can use the chatbot without an account.
create table if not exists chatbot_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references profiles(id) on delete set null,
  query         text not null,
  response      text not null,
  matched_rule  text,
  used_nlp      boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists chatbot_logs_user_idx on chatbot_logs (user_id);

-- ─── Row Level Security ───────────────────────────────────────────────
-- All server-side writes from apps/api use the service-role client
-- (core/supabase.py:get_admin_client), which bypasses RLS entirely. These
-- policies are the real authorization boundary for anything querying
-- Supabase directly with a user's JWT — e.g. the Realtime availability
-- listener and any direct-from-browser reads.

alter table books enable row level security;
alter table borrow_transactions enable row level security;
alter table reservations enable row level security;
alter table notifications enable row level security;
alter table chatbot_logs enable row level security;

-- books: catalog is public (Guest browses without logging in). Only
-- librarians can add/edit/remove titles.
create policy "books_select_all" on books
  for select to anon, authenticated
  using (true);

create policy "books_write_librarian" on books
  for insert to authenticated
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'librarian'));

create policy "books_update_librarian" on books
  for update to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'librarian'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'librarian'));

create policy "books_delete_librarian" on books
  for delete to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'librarian'));

-- borrow_transactions: users see only their own loans; librarians see and
-- manage all (borrow/return happens at the librarian's scan counter).
create policy "borrow_tx_select_own_or_librarian" on borrow_transactions
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and role = 'librarian')
  );

create policy "borrow_tx_write_librarian" on borrow_transactions
  for insert to authenticated
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'librarian'));

create policy "borrow_tx_update_librarian" on borrow_transactions
  for update to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'librarian'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'librarian'));

-- reservations: users manage their own (place/cancel); librarians see and
-- confirm/reject all.
create policy "reservations_select_own_or_librarian" on reservations
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and role = 'librarian')
  );

create policy "reservations_insert_own" on reservations
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "reservations_update_own_or_librarian" on reservations
  for update to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and role = 'librarian')
  )
  with check (
    user_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and role = 'librarian')
  );

-- notifications: users read/mark-read only their own. No client-side
-- insert policy — these are always system-generated via the service-role
-- client (borrow/return/reservation events, due-date scheduler).
create policy "notifications_select_own" on notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy "notifications_update_own" on notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- chatbot_logs: anyone (guest or logged-in) can log their own query; only
-- the acting user's own logs, never someone else's. Librarians can read
-- all logs for KB/report review. No update/delete — append-only.
create policy "chatbot_logs_insert_own_or_anon" on chatbot_logs
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

create policy "chatbot_logs_select_own_or_librarian" on chatbot_logs
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and role = 'librarian')
  );
