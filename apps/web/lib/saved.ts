// apps/web/lib/saved.ts
// Fetch layer for /saved-books — the "Saved" tab in My Library and the
// bookmark buttons on the catalog/detail pages. RLS scopes every call to
// the caller's own rows (0013_saved_books.sql).

import { getToken } from "@/lib/auth"
import type { Book } from "@lasallia/types"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

function authHeaders(): HeadersInit {
  const token = getToken()
  if (!token) throw new Error("Not signed in")
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

async function parseErrorOrThrow(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({}))
  throw new Error(body.detail ?? fallback)
}

export type SavedBook = {
  id: string
  user_id: string
  book_id: string
  created_at: string
  books: Book | null
}

export async function fetchSavedBooks(): Promise<SavedBook[]> {
  const res = await fetch(`${API_URL}/saved-books`, { headers: authHeaders() })
  if (!res.ok) return parseErrorOrThrow(res, "Failed to load saved books")
  return res.json()
}

export async function saveBook(bookId: string): Promise<SavedBook> {
  const res = await fetch(`${API_URL}/saved-books`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ book_id: bookId }),
  })
  if (!res.ok) return parseErrorOrThrow(res, "Could not save this book")
  return res.json()
}

export async function unsaveBook(bookId: string): Promise<void> {
  const res = await fetch(`${API_URL}/saved-books/${bookId}`, {
    method: "DELETE",
    headers: authHeaders(),
  })
  if (!res.ok && res.status !== 404) return parseErrorOrThrow(res, "Could not remove this saved book")
}
