// apps/web/components/ui/catalog/BookCard.tsx
// Sprint 3.1.3 — Book card grid component (cover color indicator, title, author, year, availability pill)

import { Book } from '@lasallia/types'
import { AvailabilityPill } from '@/components/ui/pills/availability-pill'
import { cn } from '@/lib/utils'
import Link from 'next/link'

type BookCardProps = {
  book: Book
  href?: string
  className?: string
}

// Deterministic color palette for books without cover images
const COVER_COLORS = [
  '#1E3A5F', '#5C3D11', '#1B3A2D', '#4A1942',
  '#2C3E50', '#1A1A2E', '#0F4C75', '#154360',
  '#1B2631', '#2E4057', '#3B1F2B', '#1C3144',
]

function getCoverColor(book: Book): string {
  if (book.cover_color) return book.cover_color
  // Deterministic from id
  const idx = book.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return COVER_COLORS[idx % COVER_COLORS.length]
}

export function BookCard({ book, href, className }: BookCardProps) {
  const coverColor = getCoverColor(book)
  const destination = href ?? `/guest/catalog/${book.id}`

  const authorDisplay = book.author.length > 28
    ? book.author.slice(0, 28) + '…'
    : book.author

  return (
    <Link
      href={destination}
      className={cn(
        'group flex flex-col rounded-(--radius) overflow-hidden bg-white border border-ink-200',
        'shadow-(--shadow-sm) hover:shadow-(--shadow) transition-shadow duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700',
        className
      )}
    >
      {/* Cover */}
      <div
        className="relative w-full overflow-hidden"
        style={{ aspectRatio: '2/3', background: coverColor }}
      >
        {book.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={book.cover_url}
            alt={`Cover of ${book.title}`}
            className="w-full h-full object-cover"
          />
        ) : (
          // Decorative grid pattern + author text overlay
          <div className="relative w-full h-full flex flex-col justify-between p-3">
            {/* Subtle grid lines */}
            <svg
              className="absolute inset-0 w-full h-full opacity-10"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <pattern id={`grid-${book.id}`} width="24" height="24" patternUnits="userSpaceOnUse">
                  <path d="M 24 0 L 0 0 0 24" fill="none" stroke="white" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill={`url(#grid-${book.id})`} />
            </svg>

            {/* Author label at top */}
            <p
              className="text-white/70 uppercase font-semibold z-10 leading-tight"
              style={{
                fontSize: 'var(--text-2xs)',
                letterSpacing: 'var(--tracking-author)',
                fontFamily: 'var(--font-body)',
              }}
            >
              {authorDisplay}
            </p>

            {/* Title at bottom */}
            <p
              className="text-white font-semibold z-10 leading-snug"
              style={{
                fontSize: 'var(--text-sm-body)',
                fontFamily: 'var(--font-display)',
              }}
            >
              {book.title}
            </p>
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="flex flex-col gap-1 p-3 flex-1">
        <p
          className="text-ink-900 font-semibold leading-snug line-clamp-2"
          style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
        >
          {book.title}
        </p>
        <p
          className="text-ink-400 leading-snug truncate"
          style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)' }}
        >
          {book.author}
        </p>
        {book.published_year && (
          <p
            className="text-ink-300"
            style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}
          >
            {book.published_year}
          </p>
        )}
        <div className="mt-auto pt-2">
          <AvailabilityPill status={book.status === 'misplaced' ? 'missing' : book.status} />
        </div>
      </div>
    </Link>
  )
}