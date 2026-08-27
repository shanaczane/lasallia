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

export function deriveCatalogOptions(books: Book[]) {
  return {
    genres: ['All', ...distinctSorted(books.map((b) => b.category))],
    subjects: ['All', ...COLLEGES],
    floors: ['All', ...distinctSorted(books.map((b) => b.floor))],
  }
}
