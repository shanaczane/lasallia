// apps/web/app/student/catalog/[bookId]/page.tsx
// Sprint 4.3.3 — 'You may also like' recommendations row
// Sprint 4.3.4 — Save to Favorites bookmark button
// Sprint 4.5.4 — Borrow QR button (available books only)
//
// Borrowing logic (simplified):
//   AVAILABLE  → "Borrow this book" button → QR modal → show to librarian
//   RESERVED   → "Join waitlist" only (notify me when available)
//   BORROWED   → "Join waitlist" only
//   MISSING    → informational only
// "Place on Hold" reservation date picker removed — not applicable when
//   book is already available for immediate borrowing

'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, MapPin, Hash, Building2, Calendar,
  BookOpen, Tag, Bookmark, Bell, QrCode, X, Info,
  CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { MOCK_BOOKS } from '@/lib/mock/catalog'
import { AvailabilityPill } from '@/components/ui/pills/availability-pill'
import { BookCard } from '@/components/ui/catalog'
import type { Book } from '@lasallia/types'

// ─── Cover color helper ───────────────────────────────────────────────────────

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

// ─── QR Borrow Modal (4.5.4) ──────────────────────────────────────────────────
// Shown when student taps "Borrow this book" on an available book.
// Student shows this QR to the librarian counter to process the borrow.
// Returning is done physically at the counter — no QR needed from the student.

function QRBorrowModal({ book, onClose }: { book: Book; onClose: () => void }) {
  const qrValue = `LASALLIA-BORROW-${book.id.padStart(4, '0')}-${book.call_number.replace(/\s/g, '')}`

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(20,21,15,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-sm p-6 flex flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="w-full flex items-center justify-between">
          <p
            className="text-ink-900 font-semibold"
            style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)' }}
          >
            Borrow this Book
          </p>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-ink-100 text-ink-400 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Book chip */}
        <div className="w-full flex gap-3 p-3 bg-ink-50 rounded-[10px] border border-ink-100">
          <div
            className="shrink-0 rounded-sm"
            style={{ width: 36, height: 50, background: book.cover_color ?? '#1E3A5F' }}
          />
          <div className="min-w-0">
            <p
              className="text-ink-900 font-semibold leading-snug line-clamp-2"
              style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
            >
              {book.title}
            </p>
            <p
              className="text-ink-500 mt-0.5"
              style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}
            >
              {book.author}
            </p>
            <p
              className="text-ink-400 mt-0.5"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
            >
              {book.call_number} · {book.shelf_location}
            </p>
          </div>
        </div>

        {/* QR frame — replaced by qrcode.react in Sprint 7.1.1 */}
        <div
          className="flex flex-col items-center justify-center rounded-[10px] border-2 border-dashed border-ink-200 bg-ink-50"
          style={{ width: 'var(--width-qr-frame)', height: 'var(--height-qr-frame)' }}
        >
          <QrCode size={52} className="text-ink-300" />
          <p
            className="text-ink-400 mt-2 text-center px-4"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
          >
            {qrValue}
          </p>
        </div>

        {/* Instruction */}
        <div className="w-full flex items-start gap-2 p-3 rounded-[10px] bg-green-50 border border-green-200">
          <Info size={14} className="text-green-700 shrink-0 mt-0.5" />
          <p
            className="text-green-800"
            style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}
          >
            Show this QR code to the librarian at the counter to borrow.
            To return, simply bring the book back — no QR needed.
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-[10px] bg-green-700 text-white font-semibold hover:bg-green-800 transition-colors"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
        >
          Got it
        </button>
      </div>
    </div>
  )
}

// ─── Action panel — simplified borrowing logic ────────────────────────────────
//
// AVAILABLE  → green "Borrow this book" button → opens QR modal
// NOT AVAILABLE → grey waitlist panel with "Notify me" toggle
// No date picker, no "Place on Hold" — reservation is handled by librarians

function ActionPanel({
  book,
  isAvailable,
  availableCopies,
  totalCopies,
  onBorrow,
}: {
  book: Book
  isAvailable: boolean
  availableCopies: number
  totalCopies: number
  onBorrow: () => void
}) {
  const [notified, setNotified] = useState(false)
  const pct = totalCopies > 0 ? (availableCopies / totalCopies) * 100 : 0

  if (isAvailable) {
    return (
      <div className="rounded-[10px] border border-green-200 bg-green-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 flex items-center gap-3 min-w-0">
          <div className="w-14 h-1.5 rounded-full bg-white/60 overflow-hidden shrink-0">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p
            className="text-green-800 leading-snug"
            style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
          >
            <span className="font-semibold">
              {availableCopies} of {totalCopies} {totalCopies === 1 ? 'copy' : 'copies'}
            </span>{' '}
            available — go to <span className="font-semibold">{book.shelf_location}</span> and show the QR code at the counter.
          </p>
        </div>
        {/* Borrow button */}
        <button
          type="button"
          onClick={onBorrow}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-[8px] bg-green-700 text-white font-semibold hover:bg-green-800 active:scale-95 transition-all"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
        >
          <QrCode size={15} />
          Borrow this book
        </button>
      </div>
    )
  }

  // Not available — waitlist / notify me
  if (notified) {
    return (
      <div className="rounded-[10px] border border-green-200 bg-green-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <CheckCircle2 size={16} className="text-green-600 shrink-0" />
          <p
            className="text-green-800 leading-snug"
            style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
          >
            <span className="font-semibold">You're on the waitlist</span> — we'll notify you when a copy is available. Check{' '}
            <Link
              href="/student/notifications"
              className="underline underline-offset-2 hover:text-green-900"
            >
              Notifications
            </Link>{' '}
            for updates.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNotified(false)}
          className="shrink-0 text-green-600 hover:text-green-800 underline underline-offset-2 transition-colors sm:ml-auto"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}
        >
          Leave waitlist
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-[10px] border border-ink-200 bg-ink-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 flex items-center gap-3 min-w-0">
        <div className="w-14 h-1.5 rounded-full bg-ink-200 overflow-hidden shrink-0">
          <div className="h-full rounded-full bg-ink-300" style={{ width: '0%' }} />
        </div>
        <p
          className="text-ink-600 leading-snug"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
        >
          <span className="font-semibold text-ink-700">No copies available</span> — all {totalCopies} {totalCopies === 1 ? 'copy is' : 'copies are'} currently{' '}
          {book.status === 'reserved' ? 'reserved' : 'borrowed'}. Join the waitlist to be notified.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setNotified(true)}
        className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-[8px] bg-ink-900 text-white font-semibold hover:bg-ink-700 transition-colors"
        style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
      >
        <Bell size={15} />
        Notify me
      </button>
    </div>
  )
}

// ─── You may also like (4.3.3) ────────────────────────────────────────────────

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudentBookDetailPage({
  params,
}: {
  params: Promise<{ bookId: string }>
}) {
  const { bookId }      = use(params)
  const [saved, setSaved]     = useState(false)
  const [showQR, setShowQR]   = useState(false)

  const book = MOCK_BOOKS.find((b) => b.id === bookId)

  // ── Not found ───────────────────────────────────────────────────────────────
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
  const isAvailable     = book.status === 'available' && availableCopies > 0

  return (
    <>
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

        {/* ── Two-column hero ───────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-8 mb-8">

          {/* Cover */}
          <div className="shrink-0 self-start mx-auto sm:mx-0">
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
          <div className="flex-1 min-w-0 flex flex-col">

            {/* Subject eyebrow */}
            {book.subject && (
              <div className="flex items-center gap-1.5 mb-3">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <span
                  className="text-green-700 font-medium"
                  style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                >
                  {book.subject}
                </span>
              </div>
            )}

            {/* Title + save button (4.3.4) */}
            <div className="flex items-start gap-3 mb-1">
              <h1
                className="text-ink-900 leading-tight flex-1"
                style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-4xl)' }}
              >
                {book.title}
              </h1>
              <button
                type="button"
                onClick={() => setSaved((v) => !v)}
                aria-label={saved ? 'Remove from saved' : 'Save to favorites'}
                className={cn(
                  'shrink-0 flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-[8px] border font-medium transition-all',
                  saved
                    ? 'border-green-600 bg-green-50 text-green-700'
                    : 'border-ink-200 bg-white text-ink-500 hover:border-green-400 hover:text-green-700',
                )}
                style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)' }}
              >
                <Bookmark size={14} className={saved ? 'fill-green-600' : ''} />
                {saved ? 'Saved' : 'Save'}
              </button>
            </div>

            {/* Author / publisher / year */}
            <p
              className="text-ink-500 mb-4"
              style={{ fontSize: 'var(--text-body)', fontFamily: 'var(--font-body)' }}
            >
              By <span className="font-semibold text-ink-700">{book.author}</span>
              {book.publisher && <> · {book.publisher}</>}
              {book.published_year && <> · {book.published_year}</>}
            </p>

            {/* Availability + format + category pills */}
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

            {/* Key bib info */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {[
                { label: 'Call Number',    value: book.call_number },
                { label: 'Shelf Location', value: book.shelf_location },
                { label: 'Publisher',      value: book.publisher },
                { label: 'ISBN',           value: book.isbn },
              ]
                .filter((i) => i.value)
                .map((i) => (
                  <div key={i.label}>
                    <p
                      className="text-ink-400 uppercase mb-0.5"
                      style={{ fontSize: 'var(--text-2xs)', letterSpacing: 'var(--tracking-section)', fontFamily: 'var(--font-body)' }}
                    >
                      {i.label}
                    </p>
                    <p
                      className="text-ink-900 font-medium leading-snug"
                      style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                    >
                      {i.value}
                    </p>
                  </div>
                ))}
            </div>

          </div>
        </div>

        {/* ── Action panel (simplified borrowing) ──────────────────────────── */}
        <div className="mb-8">
          <ActionPanel
            book={book}
            isAvailable={isAvailable}
            availableCopies={availableCopies}
            totalCopies={totalCopies}
            onBorrow={() => setShowQR(true)}
          />
        </div>

        {/* ── About ─────────────────────────────────────────────────────────── */}
        {book.abstract && (
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

        {/* ── Full bib details ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-[10px] border border-ink-200 overflow-hidden mb-10">
          <div className="px-5 py-3 border-b border-ink-100">
            <h2
              className="text-ink-700 font-semibold uppercase"
              style={{ fontSize: 'var(--text-2xs)', letterSpacing: 'var(--tracking-section)', fontFamily: 'var(--font-body)' }}
            >
              Book Details
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2">
            {[
              { icon: <Hash size={14} />,     label: 'Call Number',    value: book.call_number },
              { icon: <MapPin size={14} />,    label: 'Shelf Location', value: book.shelf_location },
              { icon: <Tag size={14} />,       label: 'Category',       value: book.category },
              { icon: <BookOpen size={14} />,  label: 'Subject',        value: book.subject },
              { icon: <Building2 size={14} />, label: 'Publisher',      value: book.publisher },
              { icon: <Calendar size={14} />,  label: 'Year Published', value: book.published_year },
              { icon: <Hash size={14} />,      label: 'ISBN',           value: book.isbn },
            ]
              .filter((r) => r.value != null && r.value !== '')
              .map((r, i, rows) => {
                const isLast = i === rows.length - 1
                const isSecondToLastOfEvenRow = rows.length % 2 === 0 && i === rows.length - 2
                const hasRightNeighbor = i + 1 < rows.length
                return (
                  <div
                    key={r.label}
                    className={cn(
                      'flex items-center gap-3 px-5 py-3 border-ink-100 min-w-0',
                      !isLast && (isSecondToLastOfEvenRow ? 'border-b sm:border-b-0' : 'border-b'),
                      i % 2 === 0 && hasRightNeighbor && 'sm:border-r',
                    )}
                  >
                    <span className="text-ink-400 shrink-0">{r.icon}</span>
                    <span
                      className="text-ink-400 w-28 shrink-0"
                      style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)' }}
                    >
                      {r.label}
                    </span>
                    <span
                      className="text-ink-900 font-medium truncate"
                      style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                    >
                      {r.value}
                    </span>
                  </div>
                )
              })}
          </div>
        </div>

        {/* ── You may also like (4.3.3) ─────────────────────────────────────── */}
        <Recommendations currentId={book.id} category={book.category} />

      </div>

      {/* QR Borrow Modal (4.5.4) */}
      {showQR && <QRBorrowModal book={book} onClose={() => setShowQR(false)} />}
    </>
  )
}