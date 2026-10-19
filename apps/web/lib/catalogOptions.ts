// Builds the catalog filter options from the loaded books. Colleges are a
// fixed list (lib/colleges.ts), so all of them are always offered.

import { Book } from '@lasallia/types'
import { COLLEGES } from './colleges'

function distinctSorted(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort()
}

// Each program's college, taken from its books, so new programs just work.
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
