// apps/web/lib/hooks/useBooks.ts
'use client'

import { useEffect, useState } from 'react'
import { Book } from '@lasallia/types'
import { fetchBook, fetchBooks } from '@/lib/books'
import { subscribeToBookChanges } from '@/lib/realtime'

// Both hooks stay live by default: a book_copies status change bumps the
// parent book (migration 0033), the subscription fires, and the data is
// refetched through the same API path as the initial load — silently, so the
// page doesn't flash a loading state.
export function useBooks({ live = true, full = false }: { live?: boolean; full?: boolean } = {}) {
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchBooks({ full })
      .then((data) => { if (!cancelled) setBooks(data) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the catalog') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!live) return
    let cancelled = false
    // A hidden tab has nobody to show it to — remember that something changed
    // and refetch once when the tab comes back, instead of on every event.
    let missedWhileHidden = false
    const refetch = () => {
      fetchBooks({ full })
        .then((data) => { if (!cancelled) setBooks(data) })
        .catch(() => {})
    }
    const unsubscribe = subscribeToBookChanges(() => {
      if (document.visibilityState === 'hidden') { missedWhileHidden = true; return }
      refetch()
    })
    const onVisible = () => {
      if (document.visibilityState === 'visible' && missedWhileHidden) { missedWhileHidden = false; refetch() }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => { cancelled = true; unsubscribe(); document.removeEventListener('visibilitychange', onVisible) }
  }, [live, full])

  return { books, loading, error }
}

export function useBook(id: string, { live = true }: { live?: boolean } = {}) {
  const [book, setBook] = useState<Book | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchBook(id)
      .then((data) => { if (!cancelled) setBook(data) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load this book') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id, reloadKey])

  useEffect(() => {
    if (!live) return
    let cancelled = false
    const unsubscribe = subscribeToBookChanges(() => {
      fetchBook(id)
        .then((data) => { if (!cancelled) setBook(data) })
        .catch(() => {})
    }, id)
    return () => { cancelled = true; unsubscribe() }
  }, [id, live])

  return { book, loading, error, refetch: () => setReloadKey((k) => k + 1) }
}
