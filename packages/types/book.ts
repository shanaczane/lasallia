// packages/types/book.ts
// Extended for Sprint 3.1 — Guest Public Catalog Screen

export type BookStatus = 'available' | 'borrowed' | 'reserved' | 'misplaced'

export type BookFormat = 'print' | 'digital' | 'reference'

export type FundingSource = 'purchased' | 'donated' | 'grant'

export type Book = {
  id: string
  accession_no?: string      // LRC physical-copy identifier, e.g. "T44882" — encoded on the QR code
  title: string
  subtitle?: string
  alternate_title?: string
  author: string             // comma-joined display string; the Add/Edit form collects it as a list and joins it
  isbn?: string
  lccn?: string
  issn?: string
  edition?: string           // e.g. "3rd Edition" — free text, not parsed out of the title
  series_title?: string
  series_volume?: string
  place_of_publication?: string
  physical_extent?: string        // e.g. "xii, 250 pages"
  physical_illustrations?: string // e.g. "illustrations, maps"
  physical_dimensions?: string    // e.g. "24 cm"
  call_number: string
  category: string           // Program the book supports, e.g. "BS Computer Science" (shown in the UI as "Program")
  subject?: string           // College the program belongs to, e.g. "CITE" (shown in the UI as "College")
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
  expected_back?: string     // soonest due_date among copies out — only set when 0 available
  waiting_count?: number     // pending + ready reservations for this title

  // ── Librarian-only administrative record ──────────────────────────────
  // Captured on the Add/Edit Book form for the LRC's own inventory records.
  // Never rendered on the student or guest catalog pages — once a real API
  // sits behind this, it should omit this block from non-librarian responses
  // rather than relying on the frontend alone to hide it.
  purchase_price?: number    // PHP
  date_acquired?: string     // ISO date the library took ownership, distinct from published_year
  circulation_type?: string  // Lending policy / collection, e.g. "General Collection - Law", "Reserve" — free text, no fixed taxonomy across departments
  vendor?: string            // Supplier the copy was bought from
  funding_source?: FundingSource
  notes?: string             // Internal staff notes — not shown to patrons, unlike `abstract`

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