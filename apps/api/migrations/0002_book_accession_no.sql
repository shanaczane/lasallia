-- 0002_book_accession_no.sql
-- Adds the LRC's accession number (e.g. "T44882") as its own column —
-- the real-world unique identifier per physical copy, and what Sprint
-- 7.1.1's per-copy QR code will encode. Safe to re-run.

alter table books
  add column if not exists accession_no text unique;

create index if not exists books_accession_no_idx on books (accession_no);
