// packages/types/book.ts
// Extended for Sprint 3.1 — Guest Public Catalog Screen

export type BookStatus = 'available' | 'borrowed' | 'reserved' | 'misplaced'

export type BookFormat = 'print' | 'digital' | 'reference'

export type Book = {
  id: string
  accession_no?: string      // LRC physical-copy identifier, e.g. "T44882" — encoded on the QR code
  title: string
  author: string
  isbn?: string
  call_number: string
  category: string           // Dewey subject category / genre
  subject?: string           // Subject heading
  shelf_location: string     // e.g. "Floor 2 · Aisle 4"
  floor?: string
  aisle?: string
  status: BookStatus
  cover_url?: string
  cover_color?: string       // Fallback color for cover placeholder
  abstract?: string
  keywords?: string[]
  published_year?: number
  publisher?: string
  format?: BookFormat
  total_copies?: number
  available_copies?: number
  call_number_start?: string // For call number range filter
  created_at: string
  updated_at: string
}

export type BookSearchResult = Book & {
  similarity_score?: number
}

export type BookSearchFilters = {
  query?: string
  genre?: string
  availability?: BookStatus | 'all'
  call_number_start?: string
  call_number_end?: string
  subject?: string
  format?: BookFormat | 'all'
  floor?: string
  published_year_start?: number
  published_year_end?: number
}

export type BookSearchResponse = {
  books: BookSearchResult[]
  total: number
  page: number
  per_page: number
}