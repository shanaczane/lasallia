// apps/web/lib/books.ts
// Thin fetch layer over apps/api's /books endpoints — mirrors lib/auth.ts's pattern.

import { Book, BookSearchResponse } from '@lasallia/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export async function fetchBooks(): Promise<Book[]> {
  const res = await fetch(`${API_URL}/books`)
  if (!res.ok) throw new Error('Failed to load the catalog')
  const data: BookSearchResponse = await res.json()
  return data.books
}

export async function fetchBook(id: string): Promise<Book | null> {
  const res = await fetch(`${API_URL}/books/${id}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Failed to load this book')
  return res.json()
}
