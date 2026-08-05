// apps/web/app/kiosk/catalog/page.tsx
// Browse, kiosk-side. Reuses useBooks() and BookCard as-is — both are
// already public/JWT-free, unlike reservations/My Library (see Phase 6
// plan's Context on why those stay out of kiosk scope). A basic
// title/author search; the student portal's fuller genre/floor/subject
// filter sidebar is skipped this pass.

'use client'

import { useState } from 'react'
import { useBooks } from '@/lib/hooks/useBooks'
import { BookCard } from '@/components/ui/catalog'
import { useKioskSession } from '@/components/kiosk/KioskSessionProvider'

export default function KioskCatalogPage() {
  const { session } = useKioskSession()
  const { books, loading, error } = useBooks()
  const [query, setQuery] = useState('')

  const needle = query.trim().toLowerCase()
  const filtered = needle
    ? books.filter((b) => b.title.toLowerCase().includes(needle) || b.author.toLowerCase().includes(needle))
    : books

  return (
    <div className="px-6 sm:px-10 py-10 max-w-6xl mx-auto">
      <p className="text-ink-500" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
        Borrowing as {session?.student_first_name ?? '…'}
      </p>
      <h1
        className="text-ink-900 font-semibold mt-1 mb-6"
        style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)' }}
      >
        Find a book
      </h1>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by title or author…"
        className="w-full max-w-md h-12 px-4 mb-8 rounded-xl border-2 border-ink-200 outline-none focus-visible:border-green-700 transition-colors"
        style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)' }}
      />

      {error ? (
        <p className="text-danger" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
          {error}
        </p>
      ) : loading ? (
        <p className="text-ink-400" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
          Loading…
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-ink-400" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
          No books match &quot;{query}&quot;.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filtered.map((book) => (
            <BookCard key={book.id} book={book} href={`/kiosk/catalog/${book.id}`} />
          ))}
        </div>
      )}
    </div>
  )
}
