export type BookStatus = 'available' | 'borrowed' | 'reserved' | 'misplaced'

export type Book = {
  id: string
  title: string
  author: string
  isbn?: string
  call_number: string
  category: string
  shelf_location: string
  status: BookStatus
  cover_url?: string
  abstract?: string
  keywords?: string[]
  published_year?: number
  created_at: string
  updated_at: string
}

export type BookSearchResult = Book & {
  similarity_score?: number
}
