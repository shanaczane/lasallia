// apps/web/components/ui/catalog/LibrarianBookCard.tsx
// Sprint 5.2.1 — Librarian book card with admin metadata (total copies, acquisition date)
// Fix: bigger cover thumbnail, responsive layout

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
  const pillStatus = book.status === 'misplaced' ? 'missing' : book.status

  return (
    <div
      className={cn(
        'group flex gap-4 items-start bg-white rounded-(--radius) border border-ink-200',
        'shadow-(--shadow-sm) hover:shadow-(--shadow) transition-shadow duration-200 p-3 sm:p-4',
        className
      )}
    >
      {/* Cover thumbnail — bigger: 72×102 on mobile, 88×124 on sm+ */}
      <Link
        href={`/librarian/catalog/${book.id}`}
        className="shrink-0 rounded-sm overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700"
        style={{ background: coverColor }}
        aria-label={`View ${book.title}`}
      >
        <div
          className="w-[72px] h-[102px] sm:w-[88px] sm:h-[124px] relative flex flex-col justify-between p-2"
        >
          {book.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={book.cover_url}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <>
              {/* Subtle grid texture */}
              <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id={`g-${book.id}`} width="16" height="16" patternUnits="userSpaceOnUse">
                    <path d="M 16 0 L 0 0 0 16" fill="none" stroke="white" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill={`url(#g-${book.id})`} />
              </svg>
              <p
                className="text-white/60 uppercase font-semibold z-10 leading-tight line-clamp-2"
                style={{ fontSize: '0.5rem', letterSpacing: '0.08em', fontFamily: 'var(--font-body)' }}
              >
                {book.author}
              </p>
              <p
                className="text-white font-semibold z-10 leading-snug line-clamp-3"
                style={{ fontSize: '0.6rem', fontFamily: 'var(--font-display)' }}
              >
                {book.title}
              </p>
            </>
          )}
        </div>
      </Link>

      {/* Main info — fills remaining width */}
      <div className="flex-1 min-w-0 self-stretch flex flex-col justify-between">
        {/* Top: title + actions */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Link href={`/librarian/catalog/${book.id}`} className="group/title focus-visible:outline-none">
              <p
                className="text-ink-900 font-semibold leading-snug line-clamp-2 group-hover/title:text-green-700 transition-colors"
                style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)' }}
              >
                {book.title}
              </p>
            </Link>
            <p
              className="text-ink-400 mt-0.5 line-clamp-1"
              style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
            >
              {book.author}
              {book.published_year && (
                <span className="text-ink-300"> · {book.published_year}</span>
              )}
            </p>
          </div>

          {/* Action buttons — always visible on mobile, hover-reveal on desktop */}
          <div className="flex items-center gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 sm:transition-opacity">
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
              className="flex items-center justify-center w-7 h-7 rounded-sm text-ink-400 hover:bg-[#FEE2E2] hover:text-[#B91C1C] transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Middle: pill + call number + location */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
          <AvailabilityPill status={pillStatus} />
          <span
            className="text-ink-400"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
          >
            {book.call_number}
          </span>
          {book.shelf_location && (
            <span
              className="text-ink-400 hidden sm:inline"
              style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}
            >
              {book.shelf_location}
            </span>
          )}
        </div>

        {/* Bottom: admin metadata */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
          {book.total_copies !== undefined && (
            <span
              className="flex items-center gap-1 text-ink-500"
              style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}
            >
              <Copy size={11} className="text-ink-300 shrink-0" />
              <span>
                <span className="font-semibold text-ink-700">{book.available_copies ?? 0}</span>
                {' / '}
                {book.total_copies}
                <span className="hidden sm:inline"> copies available</span>
              </span>
            </span>
          )}
          {book.created_at && (
            <span
              className="hidden sm:flex items-center gap-1 text-ink-400"
              style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}
            >
              <Calendar size={11} className="text-ink-300 shrink-0" />
              Acquired{' '}
              {new Date(book.created_at).toLocaleDateString('en-PH', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}