-- 0034_book_covers_bucket.sql
-- Storage bucket for book cover images. Public read (covers are shown to
-- guests on the catalog, and books.cover_url is just this bucket's public
-- URL). No write policies on purpose: the only writer is
-- POST /books/{id}/cover (routers/books.py), which validates type and size
-- and uploads with the service-role client. Browsers never write here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('book-covers', 'book-covers', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
