// apps/web/components/ui/catalog/BookGrid.tsx
// Sprint 3.1 — Responsive grid wrapper with empty/loading states
// Sprint 4.3.4 — Pass showBookmark through to BookCard

import { Book } from '@lasallia/types'
import { BookCard } from './BookCard'
import { BookOpen } from 'lucide-react'

type BookGridProps = {
  books: Book[]
  isLoading?: boolean
  hrefPrefix?: string
  showBookmark?: boolean
}

function SkeletonCard() {
  return (
    <div className="rounded-(--radius) overflow-hidden bg-white border border-ink-200 animate-pulse">
      <div className="w-full bg-ink-100" style={{ aspectRatio: '2/3' }} />
      <div className="p-3 flex flex-col gap-2">
        <div className="h-3 bg-ink-100 rounded w-4/5" />
        <div className="h-2.5 bg-ink-100 rounded w-3/5" />
        <div className="h-2 bg-ink-100 rounded w-1/4 mt-1" />
        <div className="h-5 bg-ink-100 rounded-full w-16 mt-2" />
      </div>
    </div>
  )
}

export function BookGrid({ books, isLoading = false, hrefPrefix = '/guest/catalog', showBookmark = false }: BookGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-ink-100 mb-4">
          <BookOpen size={28} className="text-ink-300" />
        </div>
        <p
          className="text-ink-700 font-semibold mb-1"
          style={{ fontSize: 'var(--text-lg)', fontFamily: 'var(--font-display)' }}
        >
          No books found
        </p>
        <p
          className="text-ink-400 max-w-xs"
          style={{ fontSize: 'var(--text-body)', fontFamily: 'var(--font-body)' }}
        >
          Try adjusting your search query or filters to find what you&apos;re looking for.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
      {books.map((book) => (
        <BookCard
          key={book.id}
          book={book}
          href={`${hrefPrefix}/${book.id}`}
          showBookmark={showBookmark}
        />
      ))}
    </div>
  )
}
