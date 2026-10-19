// Library-use-only collections, so Borrow/Reserve can be hidden. Keep in sync
// with NON_BORROWABLE_COLLECTION_TYPES in apps/api/core/loans.py (the server
// enforces it).
import type { Book } from '@lasallia/types'

export const NON_BORROWABLE_COLLECTION_TYPES = new Set([
  'Reference', 'Thesis', 'Capstone', 'MTR', 'Archives',
])

export function isLibraryUseOnly(book: Book): boolean {
  return !!book.collection_type && NON_BORROWABLE_COLLECTION_TYPES.has(book.collection_type)
}
