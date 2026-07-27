// apps/web/lib/catalogOptions.ts
// Derives filter dropdown options (genre/subject/floor) from the real,
// fetched book list instead of a hardcoded mock list.

import { Book } from '@lasallia/types'

function distinctSorted(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort()
}

export function deriveCatalogOptions(books: Book[]) {
  return {
    genres: ['All', ...distinctSorted(books.map((b) => b.category))],
    subjects: ['All', ...distinctSorted(books.map((b) => b.subject))],
    floors: ['All', ...distinctSorted(books.map((b) => b.floor))],
  }
}
