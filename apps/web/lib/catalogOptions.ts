// apps/web/lib/catalogOptions.ts
// Derives filter dropdown options (course/floor) from the real, fetched book
// list instead of a hardcoded mock list. College is the one exception — it's
// a fixed, closed taxonomy (see lib/colleges.ts), so it's offered in full
// even before every book has been tagged with one.

import { Book } from '@lasallia/types'
import { COLLEGES } from './colleges'

function distinctSorted(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort()
}

// Each program lives under exactly one college in the source data, so the
// mapping is derived from the loaded books (its most common college) instead of
// being hardcoded — new programs work the moment their books are imported.
function deriveProgramToCollege(books: Book[]): Record<string, string> {
  const counts = new Map<string, Map<string, number>>()
  for (const b of books) {
    if (!b.category || !b.subject) continue
    const byCollege = counts.get(b.category) ?? new Map<string, number>()
    byCollege.set(b.subject, (byCollege.get(b.subject) ?? 0) + 1)
    counts.set(b.category, byCollege)
  }
  const result: Record<string, string> = {}
  for (const [program, byCollege] of counts) {
    result[program] = [...byCollege.entries()].sort((a, b) => b[1] - a[1])[0][0]
  }
  return result
}

export function deriveCatalogOptions(books: Book[]) {
  return {
    programToCollege: deriveProgramToCollege(books),
    genres: ['All', ...distinctSorted(books.map((b) => b.category))],
    subjects: ['All', ...COLLEGES],
    floors: ['All', ...distinctSorted(books.map((b) => b.floor))],
  }
}
