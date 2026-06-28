// apps/web/components/ui/catalog/LibrarianBookCard.tsx
// Sprint 5.2.1 — Librarian book card with admin metadata (total copies, acquisition date)

'use client'

import Link from 'next/link'
import { Copy, Calendar, Pencil, Trash2 } from 'lucide-react'
import { Book } from '@lasallia/types'
import { AvailabilityPill } from '@/components/ui/pills/availability-pill'
import { cn } from '@/lib/utils'

const COVER_COLORS = [
  '#1E3A5F', '#5C3D11', '#1B3A2D', '#4A1942',
  '#2C3E50', '#1A1A2E', '#0F4C75', '#154360',
  '#1B2631', '#2E4057', '#3B1F2B', '#1C3144',
]

function getCoverColor(book: Book): string {
  if (book.cover_color) return book.cover_color
  const idx = book.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return COVER_COLORS[idx % COVER_COLORS.length]
}

type LibrarianBookCardProps = {
  book: Book
  onEdit?: (book: Book) => void
  onDelete?: (book: Book) => void
  className?: string
}

export function LibrarianBookCard({ book, onEdit, onDelete, className }: LibrarianBookCardProps) {
  const coverColor = getCoverColor(book)

  // Infer a display status for the pill
  const pillStatus = book.status === 'misplaced' ? 'missing' : book.status

  return (
    <div
      className={cn(
        'group flex gap-4 items-start bg-white rounded-(--radius) border border-ink-200',
        'shadow-(--shadow-sm) hover:shadow-(--shadow) transition-shadow duration-200 p-4',
        className
      )}
    >
      {/* Cover thumbnail */}
      <Link
        href={`/librarian/catalog/${book.id}`}
        className="shrink-0 rounded-sm overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700"
        style={{ width: 52, height: 74, background: coverColor }}
        aria-label={`View ${book.title}`}
      >
        {book.cover_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={book.cover_url} alt="" className="w-full h-full object-cover" />
        )}
      </Link>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <Link
              href={`/librarian/catalog/${book.id}`}
              className="group/title focus-visible:outline-none"
            >
              <p
                className="text-ink-900 font-semibold leading-snug line-clamp-1 group-hover/title:text-green-700 transition-colors"
                style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)' }}
              >
                {book.title}
              </p>
            </Link>
            <p
              className="text-ink-400 mt-0.5 truncate"
              style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
            >
              {book.author}
              {book.published_year && (
                <span className="text-ink-300"> · {book.published_year}</span>
              )}
            </p>
          </div>

          {/* Action buttons — visible on hover / focus-within */}
          <div
            className={cn(
              'flex items-center gap-1 shrink-0',
              'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity'
            )}
          >
            <button
              type="button"
              onClick={() => onEdit?.(book)}
              aria-label={`Edit ${book.title}`}
              className="flex items-center justify-center w-7 h-7 rounded-sm text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition-colors"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={() => onDelete?.(book)}
              aria-label={`Delete ${book.title}`}
              className="flex items-center justify-center w-7 h-7 rounded-sm text-ink-400 hover:bg-danger-bg hover:text-danger transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Metadata row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
          <AvailabilityPill status={pillStatus} />

          <span
            className="text-ink-400 font-mono"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
          >
            {book.call_number}
          </span>

          {book.shelf_location && (
            <span
              className="text-ink-400"
              style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}
            >
              {book.shelf_location}
            </span>
          )}
        </div>

        {/* Admin-only metadata row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
          {book.total_copies !== undefined && (
            <span className="flex items-center gap-1 text-ink-500" style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}>
              <Copy size={11} className="text-ink-300" />
              <span>
                <span className="font-semibold text-ink-700">{book.available_copies ?? 0}</span>
                {' / '}
                <span>{book.total_copies}</span>
                {' copies available'}
              </span>
            </span>
          )}

          {book.created_at && (
            <span className="flex items-center gap-1 text-ink-400" style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}>
              <Calendar size={11} className="text-ink-300" />
              <span>
                Acquired {new Date(book.created_at).toLocaleDateString('en-PH', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}