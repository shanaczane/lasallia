// apps/web/lib/colleges.ts
// Fixed list of colleges the LRC catalogs books for — one Excel source file
// per college in apps/api/data (see apps/api/scripts/seed_books.py). This is
// a known, closed taxonomy (unlike courses/programs, which vary widely), so
// it's kept as a static list rather than derived from whatever `subject`
// values happen to already be on fetched books — real book data may not
// have every college's rows tagged yet (see scripts/backfill_college.py),
// but the filter/form should still offer all of them.
//
// Add an entry here (and the matching .xlsx + seed_books.py mapping) when a
// new college's collection is onboarded.
export const COLLEGES = ['CITE', 'CBEAM', 'CEAS', 'CITHM']
