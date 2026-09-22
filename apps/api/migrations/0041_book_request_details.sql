-- 0041_book_request_details.sql
-- Faculty book requests (0039) only asked for title/author/isbn/note — not
-- enough for a librarian to actually act on an acquisition. Adds the
-- fields a real "please buy this" request needs (format, how many copies,
-- which course it's for) plus a supporting-document attachment (a reading
-- list, a screenshot of the book listing, a price quote).
alter table book_requests
  add column if not exists format text not null default 'either' check (format in ('print', 'ebook', 'either')),
  add column if not exists copies int not null default 1 check (copies >= 1),
  add column if not exists course text,
  add column if not exists attachment_url text,
  add column if not exists attachment_name text;

-- Public read, same reasoning as book-covers (0034): the only writer is
-- POST /book-requests/{id}/attachment (routers/book_requests.py), which
-- checks the caller owns the request and validates type/size before
-- uploading with the service-role client — browsers never write here
-- directly. Not especially sensitive content (a reading list, a listing
-- screenshot), same trust level as a book cover image.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'book-request-attachments', 'book-request-attachments', true,
  10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
