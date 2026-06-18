// apps/web/app/student/catalog/[bookId]/page.tsx
// Sprint 4.3.2 — Reservation action panel (pickup date + place hold)
// Sprint 4.3.3 — 'You may also like' recommendations row
// Sprint 4.3.4 — Save to Favorites bookmark button

'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, MapPin, Hash, Building2, Calendar, BookOpen,
  Tag, Bookmark, CheckCircle2, Bell,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { MOCK_BOOKS } from '@/lib/mock/catalog'
import { AvailabilityPill } from '@/components/ui/pills/availability-pill'
import { BookCard } from '@/components/ui/catalog'

// ─── Cover helpers ─────────────────────────────────────────────────────────────
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

// ─── Bib detail grid ───────────────────────────────────────────────────────────
function BibGrid({ items }: { items: Array<{ label: string; value?: string | number | null }> }) {
  const visible = items.filter((i) => i.value != null && i.value !== '')
  if (!visible.length) return null
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
      {visible.map((item) => (
        <div key={item.label}>
          <p
            className="text-ink-400 uppercase mb-0.5"
            style={{ fontSize: 'var(--text-2xs)', letterSpacing: 'var(--tracking-section)', fontFamily: 'var(--font-body)' }}
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

// ─── Reservation panel (4.3.2) ─────────────────────────────────────────────────
function ReservationPanel({ available, total }: { available: number; total: number }) {
  const isNone = available === 0
  const isLow  = !isNone && available / total < 0.4
  const pct    = total > 0 ? (available / total) * 100 : 0

  const today   = new Date()
  const minDate = new Date(today); minDate.setDate(today.getDate() + 1)
  const maxDate = new Date(today); maxDate.setDate(today.getDate() + 14)
  const fmt     = (d: Date) => d.toISOString().split('T')[0]

  const [pickupDate, setPickupDate] = useState(fmt(minDate))
  const [placed,     setPlaced]     = useState(false)
  const [notified,   setNotified]   = useState(false)

  const colorClass = isNone ? 'bg-red-50 border-red-200' : isLow ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'
  const textColor  = isNone ? 'text-red-700'  : isLow ? 'text-amber-700'  : 'text-green-700'
  const barColor   = isNone ? 'bg-red-400'    : isLow ? 'bg-amber-400'    : 'bg-green-500'

  if (placed) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-5 py-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 size={24} className="text-green-600 shrink-0" />
          <div>
            <p className="font-semibold text-green-800" style={{ fontSize: 'var(--text-base)', fontFamily: 'var(--font-body)' }}>
              Hold placed!
            </p>
            <p className="text-green-700 mt-0.5" style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}>
              Ready for pickup by <strong>{new Date(pickupDate + 'T00:00:00').toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>.
              Check your <Link href="/student/reservations" className="underline underline-offset-2 hover:text-green-900">Reservations</Link> for status.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setPlaced(false)}
          className="shrink-0 text-green-600 hover:text-green-800 underline underline-offset-2 transition-colors sm:ml-auto"
          style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)' }}
        >
          Cancel hold
        </button>
      </div>
    )
  }

  return (
    <div className={cn('rounded-lg border px-5 py-4 space-y-4', colorClass)}>
      {/* Availability row */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className={cn('font-semibold mb-1', textColor)} style={{ fontSize: 'var(--text-base)', fontFamily: 'var(--font-body)' }}>
            {isNone
              ? 'No copies currently available'
              : `${available} of ${total} ${total === 1 ? 'copy' : 'copies'} available`}
          </p>
          <div className="w-40 h-1.5 rounded-full bg-white/60 overflow-hidden">
            <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <AvailabilityPill status={isNone ? 'borrowed' : 'available'} />
      </div>

      {/* Action row */}
      {!isNone ? (
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="pickup-date"
              className="text-ink-600 font-medium"
              style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)' }}
            >
              Pickup date
            </label>
            <input
              suppressHydrationWarning
              id="pickup-date"
              type="date"
              value={pickupDate}
              min={fmt(minDate)}
              max={fmt(maxDate)}
              onChange={(e) => setPickupDate(e.target.value)}
              className="rounded-md border border-ink-200 bg-white px-3 py-2 text-ink-900 focus:outline-none focus:border-green-700 transition-colors"
              style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
            />
          </div>
          <button
            type="button"
            onClick={() => setPlaced(true)}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-md font-semibold text-white bg-green-700 hover:bg-green-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-1"
            style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
          >
            <BookOpen size={15} />
            Place Hold
          </button>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-ink-500 flex-1" style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}>
            All copies are currently borrowed. You can join the waitlist and be notified when one is returned.
          </p>
          <button
            type="button"
            onClick={() => setNotified((v) => !v)}
            className={cn(
              'shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-md font-semibold transition-colors',
              notified
                ? 'bg-ink-200 text-ink-600'
                : 'bg-red-600 text-white hover:bg-red-700'
            )}
            style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
          >
            <Bell size={14} />
            {notified ? 'Waitlisted' : 'Notify me'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── You may also like (4.3.3) ─────────────────────────────────────────────────
function Recommendations({ currentId, category }: { currentId: string; category: string }) {
  const related = MOCK_BOOKS
    .filter((b) => b.category === category && b.id !== currentId)
    .slice(0, 4)

  if (related.length === 0) return null

  return (
    <div className="mb-8">
      <h2
        className="text-ink-900 font-semibold mb-4"
        style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)' }}
      >
        You may also like
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {related.map((book) => (
          <BookCard
            key={book.id}
            book={book}
            href={`/student/catalog/${book.id}`}
            showBookmark
          />
        ))}
      </div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function StudentBookDetailPage({
  params,
}: {
  params: Promise<{ bookId: string }>
}) {
  const { bookId } = use(params)
  const [saved, setSaved] = useState(false)

  const book = MOCK_BOOKS.find((b) => b.id === bookId)

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
          href="/student/catalog"
          className="inline-flex items-center gap-2 text-green-700 font-medium hover:text-green-800 transition-colors"
          style={{ fontSize: 'var(--text-body)', fontFamily: 'var(--font-body)' }}
        >
          <ArrowLeft size={16} />
          Back to catalog
        </Link>
      </div>
    )
  }

  const coverColor      = getCoverColor(book.id, book.cover_color)
  const availableCopies = book.available_copies ?? (book.status === 'available' ? 1 : 0)
  const totalCopies     = book.total_copies ?? 1

  return (
    <div className="px-5 sm:px-8 py-7 max-w-5xl mx-auto">

      {/* Back */}
      <Link
        href="/student/catalog"
        className="inline-flex items-center gap-1.5 text-ink-400 hover:text-green-700 transition-colors mb-7"
        style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
      >
        <ArrowLeft size={15} />
        Back to results
      </Link>

      {/* ── Two-column hero ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-8 mb-8">

        {/* Cover */}
        <div className="shrink-0 self-start mx-auto sm:mx-0">
          <div
            className="rounded-xl overflow-hidden shadow-xl"
            style={{ width: 176, aspectRatio: '2/3', background: coverColor }}
          >
            {book.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={book.cover_url} alt={`Cover of ${book.title}`} className="w-full h-full object-cover" />
            ) : (
              <div className="relative w-full h-full flex flex-col justify-between p-4">
                <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <pattern id={`g-${book.id}`} width="24" height="24" patternUnits="userSpaceOnUse">
                      <path d="M 24 0 L 0 0 0 24" fill="none" stroke="white" strokeWidth="0.5" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill={`url(#g-${book.id})`} />
                </svg>
                <p
                  className="text-white/60 uppercase font-semibold z-10 leading-tight"
                  style={{ fontSize: 'var(--text-2xs)', letterSpacing: 'var(--tracking-author)', fontFamily: 'var(--font-body)' }}
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
          {book.subject && (
            <div className="flex items-center gap-1.5 mb-3">
              <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <span className="text-green-700 font-medium" style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}>
                {book.subject}
              </span>
            </div>
          )}

          {/* Title + bookmark */}
          <div className="flex items-start gap-3 mb-1">
            <h1
              className="text-ink-900 leading-tight flex-1"
              style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-4xl)' }}
            >
              {book.title}
            </h1>
            {/* 4.3.4 — Bookmark / Save to Favorites */}
            <button
              type="button"
              onClick={() => setSaved((v) => !v)}
              aria-label={saved ? 'Remove from saved' : 'Save to favorites'}
              className={cn(
                'shrink-0 flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-lg border font-medium transition-all',
                saved
                  ? 'border-green-600 bg-green-50 text-green-700'
                  : 'border-ink-200 bg-white text-ink-500 hover:border-green-400 hover:text-green-700'
              )}
              style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)' }}
            >
              <Bookmark size={14} className={saved ? 'fill-green-600' : ''} />
              {saved ? 'Saved' : 'Save'}
            </button>
          </div>

          {book.abstract && book.abstract.length <= 80 && (
            <p className="text-ink-500 mb-3" style={{ fontSize: 'var(--text-lg)', fontFamily: 'var(--font-body)' }}>
              {book.abstract}
            </p>
          )}

          <p className="text-ink-500 mb-4" style={{ fontSize: 'var(--text-body)', fontFamily: 'var(--font-body)' }}>
            By <span className="font-semibold text-ink-700">{book.author}</span>
            {book.publisher && <> · {book.publisher}</>}
            {book.published_year && <> · {book.published_year}</>}
          </p>

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

      {/* ── Reservation panel (4.3.2) ───────────────────────────────────── */}
      <div className="mb-8">
        <ReservationPanel available={availableCopies} total={totalCopies} />
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
      <div className="bg-white rounded-xl border border-ink-200 overflow-hidden mb-10">
        <div className="px-5 py-3 border-b border-ink-100">
          <h2
            className="text-ink-700 font-semibold uppercase"
            style={{ fontSize: 'var(--text-2xs)', letterSpacing: 'var(--tracking-section)', fontFamily: 'var(--font-body)' }}
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
                <span className="text-ink-400 shrink-0">{row.icon}</span>
                <span
                  className="text-ink-400 w-32 shrink-0"
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

      {/* ── You may also like (4.3.3) ────────────────────────────────────── */}
      <Recommendations currentId={book.id} category={book.category} />

    </div>
  )
}
