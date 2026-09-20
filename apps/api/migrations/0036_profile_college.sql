-- 0036_profile_college.sql
-- profiles.program already holds a student's specific degree program (or,
-- for faculty, a free-text college name typed however the enrollment data
-- had it) — but nothing stores which of the catalog's actual college codes
-- (apps/web/lib/colleges.ts: CITE, CBEAM, CEAS, CITHM, HEALTH-ALLIED,
-- GEN-AD, GRADUATE SCHOOL) a patron belongs to. The frontend has been
-- guessing this from `program` via lib/collegeForProgram.ts's keyword
-- heuristic; this column lets it be set for real instead, same as `program`
-- and `year_level` (0001) — plain text, no check constraint, matching how
-- books.category/subject is also unconstrained at the DB level and
-- validated by the frontend's fixed dropdown instead.
alter table profiles
  add column if not exists college text;
