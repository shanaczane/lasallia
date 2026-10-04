// apps/web/lib/collectionType.ts
// Mirrors apps/api/core/loans.py's NON_BORROWABLE_COLLECTION_TYPES — kept in
// sync by hand since this is a fixed, rarely-changing list, not data the
// frontend fetches from anywhere. The backend is still the authoritative
// enforcement (check_borrow_eligibility / routers/reservations.py); this is
// only so the Borrow/Reserve actions don't show up in the first place.
import type { Book } from '@lasallia/types'

export const NON_BORROWABLE_COLLECTION_TYPES = new Set([
  'Reference', 'Thesis', 'Capstone', 'MTR', 'Archives',
])

export function isLibraryUseOnly(book: Book): boolean {
  return !!book.collection_type && NON_BORROWABLE_COLLECTION_TYPES.has(book.collection_type)
}
