// apps/web/lib/hooks/useBooks.ts
'use client'

import { useEffect, useState } from 'react'
import { Book } from '@lasallia/types'
import { fetchBook, fetchBooks } from '@/lib/books'

export function useBooks() {
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchBooks()
      .then((data) => { if (!cancelled) setBooks(data) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the catalog') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return { books, loading, error }
}

export function useBook(id: string) {
  const [book, setBook] = useState<Book | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchBook(id)
      .then((data) => { if (!cancelled) setBook(data) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load this book') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])

  return { book, loading, error }
}
