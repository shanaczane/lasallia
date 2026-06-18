// apps/web/app/guest/catalog/[bookId]/page.tsx
// Sprint 3.1.4 — Book detail page (Guest view — no reservation action)

'use client'

import { use } from 'react'
import Link from 'next/link'
import { ArrowLeft, MapPin, Hash, Building2, Calendar, BookOpen, Tag, BookMarked } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MOCK_BOOKS } from '@/lib/mock/catalog'
import { AvailabilityPill } from '@/components/ui/pills/availability-pill'

// ─── Cover helpers ────────────────────────────────────────────────────────────
const COVER_COLORS = [
  '#1E3A5F', '#5C3D11', '#1B3A2D', '#4A1942',
  '#2C3E50', '#1A1A2E', '#0F4C75', '#154360',
  '#1B2631', '#2E4057', '#3B1F2B', '#1C3144',
]

function getCoverColor(id: string, override?: string): string {
  if (override) return override
  const idx = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return COVER_COLORS[idx % COVER_COLORS.length]
}

// ─── Two-column bib detail grid ───────────────────────────────────────────────
function BibGrid({ items }: { items: Array<{ label: string; value?: string | number | null }> }) {
  const visible = items.filter((i) => i.value != null && i.value !== '')
  if (!visible.length) return null
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
      {visible.map((item) => (
        <div key={item.label}>
          <p
            className="text-ink-400 uppercase mb-0.5"
            style={{
              fontSize: 'var(--text-2xs)',
              letterSpacing: 'var(--tracking-section)',
              fontFamily: 'var(--font-body)',
            }}
          >
            {item.label}
          </p>
          <p
            className="text-ink-900 font-medium leading-snug"
            style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
          >
            {item.value}
          </p>
        </div>
      ))}
    </div>
  )
}

// ─── Availability callout ─────────────────────────────────────────────────────
function AvailabilityCallout({ available, total }: { available: number; total: number }) {
  const pct = total > 0 ? (available / total) * 100 : 0
  const isNone = available === 0
  const isLow  = !isNone && available / total < 0.4

  return (
    <div
      className={cn(
        'rounded-lg px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4',
        isNone ? 'bg-red-50 border border-red-200' :
        isLow  ? 'bg-amber-50 border border-amber-200' :
                 'bg-green-50 border border-green-200'
      )}
    >
      <div>
        <p
          className={cn(
            'font-semibold mb-0.5',
            isNone ? 'text-red-700' : isLow ? 'text-amber-700' : 'text-green-700'
          )}
          style={{ fontSize: 'var(--text-base)', fontFamily: 'var(--font-body)' }}
        >
          {isNone
            ? 'No copies available'
            : `${available} of ${total} ${total === 1 ? 'copy' : 'copies'} available`}
        </p>
        <div className="w-40 h-1.5 rounded-full bg-white/60 overflow-hidden mt-1.5">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              isNone ? 'bg-red-400' : isLow ? 'bg-amber-400' : 'bg-green-500'
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      {/* Sprint 3.1 — guest prompt only; reservation wired in Sprint 4.3 */}
      <Link
        href="/login"
        className={cn(
          'inline-flex items-center gap-2 px-4 py-2 rounded-md font-semibold text-white transition-colors flex-shrink-0',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
          isNone
            ? 'bg-ink-400 hover:bg-ink-500 focus-visible:ring-ink-400'
            : 'bg-green-700 hover:bg-green-800 focus-visible:ring-green-700'
        )}
        style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
      >
        <BookMarked size={15} />
        {isNone ? 'Join waitlist' : 'Reserve copy'}
      </Link>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function GuestBookDetailPage({
  params,
}: {
  params: Promise<{ bookId: string }>
}) {
  const { bookId } = use(params)

  // Sprint 5: replace with fetch(`/api/books/${bookId}`)
  const book = MOCK_BOOKS.find((b) => b.id === bookId)

  // ── 404 state ────────────────────────────────────────────────────────────
  if (!book) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
        <div className="w-16 h-16 rounded-full bg-ink-100 flex items-center justify-center mb-5">
          <BookOpen size={28} className="text-ink-300" />
        </div>
        <h1
          className="text-ink-900 font-semibold mb-2"
          style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)' }}
        >
          Book not found
        </h1>
        <p
          className="text-ink-400 mb-6 max-w-xs"
          style={{ fontSize: 'var(--text-body)', fontFamily: 'var(--font-body)' }}
        >
          This title may have been removed or the link is incorrect.
        </p>
        <Link
          href="/guest/catalog"
          className="inline-flex items-center gap-2 text-green-700 font-medium hover:text-green-800 transition-colors"
          style={{ fontSize: 'var(--text-body)', fontFamily: 'var(--font-body)' }}
        >
          <ArrowLeft size={16} />
          Back to catalog
        </Link>
      </div>
    )
  }

  const coverColor     = getCoverColor(book.id, book.cover_color)
  const availableCopies = book.available_copies ?? (book.status === 'available' ? 1 : 0)
  const totalCopies    = book.total_copies ?? 1

  return (
    <div className="px-5 sm:px-8 py-7 max-w-5xl mx-auto">

      {/* Back */}
      <Link
        href="/guest/catalog"
        className="inline-flex items-center gap-1.5 text-ink-400 hover:text-green-700 transition-colors mb-7"
        style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
      >
        <ArrowLeft size={15} />
        Back to results
      </Link>

      {/* ── Two-column hero ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-8 mb-8">

        {/* Cover */}
        <div className="flex-shrink-0 self-start mx-auto sm:mx-0">
          <div
            className="rounded-xl overflow-hidden shadow-xl"
            style={{ width: 176, aspectRatio: '2/3', background: coverColor }}
          >
            {book.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={book.cover_url}
                alt={`Cover of ${book.title}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="relative w-full h-full flex flex-col justify-between p-4">
                <svg
                  className="absolute inset-0 w-full h-full opacity-10"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <pattern id={`g-${book.id}`} width="24" height="24" patternUnits="userSpaceOnUse">
                      <path d="M 24 0 L 0 0 0 24" fill="none" stroke="white" strokeWidth="0.5" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill={`url(#g-${book.id})`} />
                </svg>
                <p
                  className="text-white/60 uppercase font-semibold z-10 leading-tight"
                  style={{
                    fontSize: 'var(--text-2xs)',
                    letterSpacing: 'var(--tracking-author)',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {book.author}
                </p>
                <p
                  className="text-white font-semibold z-10 leading-snug"
                  style={{ fontSize: 'var(--text-base)', fontFamily: 'var(--font-display)' }}
                >
                  {book.title}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Title block */}
        <div className="flex-1 min-w-0 flex flex-col justify-start">
          {/* Subject tag */}
          {book.subject && (
            <div className="flex items-center gap-1.5 mb-3">
              <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
              <span
                className="text-green-700 font-medium"
                style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
              >
                {book.subject}
              </span>
            </div>
          )}

          {/* Title */}
          <h1
            className="text-ink-900 leading-tight mb-1"
            style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-4xl)' }}
          >
            {book.title}
          </h1>

          {/* Abstract as subtitle if short, else shown below */}
          {book.abstract && book.abstract.length <= 80 && (
            <p
              className="text-ink-500 mb-3"
              style={{ fontSize: 'var(--text-lg)', fontFamily: 'var(--font-body)' }}
            >
              {book.abstract}
            </p>
          )}

          {/* Author + meta line */}
          <p
            className="text-ink-500 mb-4"
            style={{ fontSize: 'var(--text-body)', fontFamily: 'var(--font-body)' }}
          >
            By <span className="font-semibold text-ink-700">{book.author}</span>
            {book.publisher && <> · {book.publisher}</>}
            {book.published_year && <> · {book.published_year}</>}
          </p>

          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <AvailabilityPill status={book.status === 'misplaced' ? 'missing' : book.status} />
            {book.format && (
              <span
                className="px-2.5 py-0.5 rounded-full bg-ink-100 text-ink-500 font-medium capitalize"
                style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}
              >
                {book.format}
              </span>
            )}
            {book.category && (
              <span
                className="px-2.5 py-0.5 rounded-full bg-ink-100 text-ink-500 font-medium"
                style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}
              >
                {book.category}
              </span>
            )}
          </div>

          {/* Bib grid — 2 columns */}
          <BibGrid
            items={[
              { label: 'Call Number',    value: book.call_number },
              { label: 'ISBN',           value: book.isbn },
              { label: 'Shelf Location', value: book.shelf_location },
              { label: 'Publisher',      value: book.publisher },
            ]}
          />
        </div>
      </div>

      {/* ── Availability callout ────────────────────────────────────────── */}
      <div className="mb-8">
        <AvailabilityCallout available={availableCopies} total={totalCopies} />
        <p
          className="text-ink-400 mt-2 text-center"
          style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}
        >
          Sign in with your DLSL school account to place a hold or borrow.
        </p>
      </div>

      {/* ── About this book ─────────────────────────────────────────────── */}
      {book.abstract && book.abstract.length > 80 && (
        <div className="mb-8">
          <h2
            className="text-ink-900 font-semibold mb-3"
            style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)' }}
          >
            About this book
          </h2>
          <p
            className="text-ink-600 leading-relaxed"
            style={{ fontSize: 'var(--text-body)', fontFamily: 'var(--font-body)' }}
          >
            {book.abstract}
          </p>
        </div>
      )}

      {/* ── Full bib details card ────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-ink-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-ink-100">
          <h2
            className="text-ink-700 font-semibold uppercase"
            style={{
              fontSize: 'var(--text-2xs)',
              letterSpacing: 'var(--tracking-section)',
              fontFamily: 'var(--font-body)',
            }}
          >
            Book Details
          </h2>
        </div>
        <div className="divide-y divide-ink-100">
          {[
            { icon: <Hash size={14} />,      label: 'Call Number',    value: book.call_number },
            { icon: <MapPin size={14} />,     label: 'Shelf Location', value: book.shelf_location },
            { icon: <Tag size={14} />,        label: 'Category',       value: book.category },
            { icon: <BookOpen size={14} />,   label: 'Subject',        value: book.subject },
            { icon: <Building2 size={14} />,  label: 'Publisher',      value: book.publisher },
            { icon: <Calendar size={14} />,   label: 'Year Published', value: book.published_year },
            { icon: <Hash size={14} />,       label: 'ISBN',           value: book.isbn },
          ]
            .filter((row) => row.value != null && row.value !== '')
            .map((row) => (
              <div key={row.label} className="flex items-center gap-4 px-5 py-3">
                <span className="text-ink-400 flex-shrink-0">{row.icon}</span>
                <span
                  className="text-ink-400 w-32 flex-shrink-0"
                  style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)' }}
                >
                  {row.label}
                </span>
                <span
                  className="text-ink-900 font-medium"
                  style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                >
                  {row.value}
                </span>
              </div>
            ))}
        </div>
      </div>

    </div>
  )
}