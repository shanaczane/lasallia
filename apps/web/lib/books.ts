// API calls for the catalog.

import { Book, BookSearchResponse } from '@lasallia/types'
import { getToken } from '@/lib/auth'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

// Sends the token if signed in, so librarians also get accession numbers.
function optionalAuthHeaders(): HeadersInit {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// Leaves out descriptions unless full is true (they're most of the size).
export async function fetchBooks({ full = false }: { full?: boolean } = {}): Promise<Book[]> {
  const res = await fetch(`${API_URL}/books${full ? '?include_abstract=true' : ''}`, { headers: optionalAuthHeaders() })
  if (!res.ok) throw new Error('Failed to load the catalog')
  const data: BookSearchResponse = await res.json()
  return data.books
}

export async function fetchBook(id: string): Promise<Book | null> {
  const res = await fetch(`${API_URL}/books/${id}`, { headers: optionalAuthHeaders() })
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Failed to load this book')
  return res.json()
}

// "You may also like" books. Returns [] on failure, so the row just hides.
export async function fetchSimilarBooks(id: string, limit = 5): Promise<Book[]> {
  const res = await fetch(`${API_URL}/books/${id}/similar?limit=${limit}`, { headers: optionalAuthHeaders() })
  if (!res.ok) return []
  return res.json()
}

// What the book form sends to the API. Accession numbers and copy counts
// aren't book fields: copies get their numbers when they're created.
export type BookWritePayload = Omit<
  Book,
  | 'id' | 'created_at' | 'updated_at' | 'expected_back' | 'waiting_count' | 'cover_color' | 'call_number_start'
  | 'accession_no' | 'total_copies' | 'available_copies' | 'reserved_copies'
>

// Prefixes the accession counter knows. T is the general collection.
export type AccessionPrefix = 'T' | 'GS'

export type BookCreatePayload = BookWritePayload & {
  copy_count: number
  prefix: AccessionPrefix
  // Set after the "same title and author, no ISBN" warning.
  confirm_possible_duplicate?: boolean
}

// A save that created copies, with the numbers they were given.
export type BookWithNewCopies = Book & { assigned_accession_numbers: string[] }

// The book an ISBN or title check matched. Never includes accession numbers.
export type MatchedBook = { id: string; title: string; author?: string | null; archived?: boolean }

// An API error with the structured details some 409s carry.
export class BookApiError extends Error {
  code?: string  // 'duplicate_isbn' | 'possible_duplicate' | 'large_jump'
  book?: MatchedBook
  nextValue?: string
  status: number

  constructor(message: string, status: number, detail?: Record<string, unknown>) {
    super(message)
    this.name = 'BookApiError'
    this.status = status
    if (detail) {
      this.code = detail.code as string | undefined
      this.book = detail.book as MatchedBook | undefined
      this.nextValue = detail.next_value as string | undefined
    }
  }
}

export async function createBook(data: BookCreatePayload): Promise<BookWithNewCopies> {
  const res = await fetch(`${API_URL}/books`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Could not add this book')
  return res.json()
}

export async function updateBook(id: string, data: BookWritePayload): Promise<Book> {
  // Edits never send accession numbers or copy counts.
  const res = await fetch(`${API_URL}/books/${id}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Could not save changes to this book')
  return res.json()
}

// Deletes a book for good. Refused (409) if a copy is on loan; archive it instead.
export async function deleteBook(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/books/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Could not delete this book')
}

// New copies of a book already in the catalog. Each gets the next accession
// number; the response lists them.
export async function addCopiesToBook(id: string, count: number, prefix: AccessionPrefix = 'T'): Promise<BookWithNewCopies> {
  const res = await fetch(`${API_URL}/books/${id}/add-copies`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ count, prefix }),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Could not add copies to this book')
  return res.json()
}

// The accession numbers new copies would get if saved now. Nothing is
// reserved, so the saved numbers can differ if someone else saves first.
export async function previewAccessionNumbers(prefix: AccessionPrefix, count: number): Promise<string[]> {
  const params = new URLSearchParams({ prefix, count: String(count) })
  const res = await fetch(`${API_URL}/books/accession-preview?${params}`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, 'Could not look up the next accession numbers')
  return res.json()
}

// ── Librarians only: individual copies.

export type BookCopy = {
  id: string
  accession_number: string
  status: string
  // Always "Unassigned"; use the book's shelf_location instead.
  shelf_location: string | null
  // Only for copies on loan: who has it and when it's due.
  borrower_name: string | null
  due_date: string | null
}

function authHeaders(): HeadersInit {
  const token = getToken()
  if (!token) throw new Error('Not signed in')
  return { Authorization: `Bearer ${token}` }
}

// FastAPI sends detail as a string, an object (the structured 409s), or a
// list (request validation errors).
async function parseErrorOrThrow(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({}))
  const detail = body.detail
  if (typeof detail === 'string') throw new BookApiError(detail, res.status)
  if (Array.isArray(detail)) {
    const message = detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join('. ')
    throw new BookApiError(message || fallback, res.status)
  }
  if (detail && typeof detail === 'object') {
    throw new BookApiError((detail.message as string) ?? fallback, res.status, detail)
  }
  throw new BookApiError(fallback, res.status)
}

export async function fetchBookCopies(bookId: string): Promise<BookCopy[]> {
  const res = await fetch(`${API_URL}/books/${bookId}/copies`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, 'Failed to load copies for this book')
  return res.json()
}

// Uploads a cover (max 5 MB, JPG/PNG/WebP) and returns its URL.
export async function uploadBookCover(bookId: string, file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_URL}/books/${bookId}/cover`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Could not upload the cover image')
  const data: { cover_url: string } = await res.json()
  return data.cover_url
}

// Marks a missing/lost/damaged copy found. It goes to the reshelving queue,
// and the reshelving scan makes it available.
export async function markCopyFound(copyId: string): Promise<void> {
  const res = await fetch(`${API_URL}/books/copies/${copyId}/mark-found`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Could not mark this copy as found')
}

// A copy that already has a number printed on it. A number far above the
// counter needs confirmLargeJump (the API answers 409 large_jump first).
export async function registerExistingCopy(bookId: string, accessionNumber: string, confirmLargeJump = false): Promise<BookCopy> {
  const res = await fetch(`${API_URL}/books/${bookId}/copies/register`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ accession_number: accessionNumber, confirm_large_jump: confirmLargeJump }),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Could not register this copy')
  return res.json()
}

export type AccessionCorrection = {
  id: string
  book_copy_id: string | null
  old_value: string
  new_value: string
  reason: string
  corrected_by: string | null
  corrected_by_name: string | null
  corrected_at: string
}

// The only way to change a copy's accession number. The reason, old and new
// values, who and when are kept.
export async function correctAccessionNumber(
  copyId: string, newAccession: string, reason: string, confirmLargeJump = false,
): Promise<AccessionCorrection> {
  const res = await fetch(`${API_URL}/books/copies/${copyId}/correct-accession`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_accession: newAccession, reason, confirm_large_jump: confirmLargeJump }),
  })
  if (!res.ok) return parseErrorOrThrow(res, 'Could not correct this accession number')
  return res.json()
}

export async function fetchAccessionCorrections(bookId: string): Promise<AccessionCorrection[]> {
  const res = await fetch(`${API_URL}/books/${bookId}/accession-corrections`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, 'Failed to load accession number corrections')
  return res.json()
}
