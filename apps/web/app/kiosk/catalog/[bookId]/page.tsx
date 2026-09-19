// apps/web/app/kiosk/catalog/[bookId]/page.tsx
// Detail view for the kiosk terminal — same two-column hero / bib-grid /
// "Book Details" card layout as the guest and student catalogs, so the
// three catalogs read as one screen. What's still cut on purpose: no
// bookmark/save, no recommendations, no reserve button — those need a
// JWT an RFID-tapped session doesn't have (see Phase 6 plan's Context).
// No accession number anywhere here, same rule as everywhere else in
// the catalog.

'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, MapPin, Hash, Building2, Calendar,
  BookOpen, GraduationCap, Landmark, QrCode, AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBook } from '@/lib/hooks/useBooks'
import { useKioskSession } from '@/components/kiosk/KioskSessionProvider'
import { BorrowModal } from '@/components/kiosk/BorrowModal'
import { fetchBorrowEligibility } from '@/lib/kiosk'
import { AvailabilityPill } from '@/components/ui/pills/availability-pill'

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

// ─── Availability / borrow action panel ───────────────────────────────────────
// Same progress-bar callout as the guest/student pages, but the call to
// action reflects what an RFID-tapped kiosk session can actually do:
// borrow directly (session), or a "tap your ID" prompt (guest browsing).

function ActionPanel({
  available,
  total,
  isAvailable,
  borrow,
  guestBrowsing,
  onBorrow,
}: {
  available: number
  total: number
  isAvailable: boolean
  // What a tapped-in student can do with this book — decided by the server
  // (GET /holds/eligibility), not guessed from copy counts.
  borrow: { state: 'none' | 'checking' | 'ready' | 'blocked'; reason?: string }
  guestBrowsing: boolean
  onBorrow: () => void
}) {
  const pct = total > 0 ? (available / total) * 100 : 0
  const isNone = available === 0
  const isLow = !isNone && available / total < 0.4

  return (
    <div
      className={cn(
        'rounded-[10px] border px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3',
        isNone ? 'bg-red-50 border-red-200' :
        isLow  ? 'bg-amber-50 border-amber-200' :
                 'bg-green-50 border-green-200'
      )}
    >
      <div className="flex-1 flex items-center gap-3 min-w-0">
        <div className="w-14 h-1.5 rounded-full bg-white/60 overflow-hidden shrink-0">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              isNone ? 'bg-red-400' : isLow ? 'bg-amber-400' : 'bg-green-500'
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p
          className={cn(
            'font-semibold leading-snug',
            isNone ? 'text-red-700' : isLow ? 'text-amber-700' : 'text-green-800'
          )}
          style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
        >
          {isNone
            ? 'No copies available right now'
            : `${available} of ${total} ${total === 1 ? 'copy' : 'copies'} available`}
        </p>
      </div>

      {borrow.state === 'blocked' ? (
        <div
          className="flex items-start gap-2 sm:max-w-sm rounded-[8px] bg-amber-50 border border-amber-200 px-3 py-2"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}
        >
          <AlertCircle size={15} className="text-amber-700 shrink-0 mt-0.5" />
          <span className="text-amber-800">{borrow.reason}</span>
        </div>
      ) : borrow.state === 'checking' ? (
        <button
          type="button"
          disabled
          className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-[8px] bg-green-700/60 text-white font-semibold cursor-wait"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
        >
          Checking…
        </button>
      ) : borrow.state === 'ready' ? (
        <button
          type="button"
          onClick={onBorrow}
          className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-[8px] bg-green-700 text-white font-semibold hover:bg-green-800 active:scale-95 transition-all"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
        >
          <QrCode size={15} />
          Borrow this book
        </button>
      ) : isAvailable && guestBrowsing ? (
        <p
          className="shrink-0 text-ink-500"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}
        >
          Tap your school ID to borrow
        </p>
      ) : null}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function KioskBookDetailPage({
  params,
}: {
  params: Promise<{ bookId: string }>
}) {
  const { bookId } = use(params)
  const { session, guestBrowsing } = useKioskSession()
  const { book, loading, error } = useBook(bookId)
  const [showBorrow, setShowBorrow] = useState(false)

  // Ask the server whether this student can actually borrow this book before
  // offering the button. Re-runs when live availability changes.
  const [eligibility, setEligibility] = useState<{ checked: boolean; canBorrow: boolean; reason: string | null }>({
    checked: false, canBorrow: false, reason: null,
  })
  const sessionId = session?.id
  const availabilityKey = `${book?.status}-${book?.available_copies}`
  useEffect(() => {
    if (!sessionId || !book) return
    let cancelled = false
    fetchBorrowEligibility(book.id, sessionId)
      .then((r) => { if (!cancelled) setEligibility({ checked: true, canBorrow: r.can_borrow, reason: r.reason }) })
      .catch(() => { if (!cancelled) setEligibility({ checked: true, canBorrow: true, reason: null }) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, book?.id, availabilityKey])

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="px-5 sm:px-8 py-7 max-w-5xl mx-auto animate-pulse">
        <div className="h-4 w-32 bg-ink-100 rounded mb-7" />
        <div className="flex flex-col sm:flex-row gap-8">
          <div className="shrink-0 mx-auto sm:mx-0 rounded-xl bg-ink-100" style={{ width: 176, aspectRatio: '2/3' }} />
          <div className="flex-1 min-w-0 flex flex-col gap-3">
            <div className="h-8 w-3/4 bg-ink-100 rounded" />
            <div className="h-4 w-1/2 bg-ink-100 rounded" />
          </div>
        </div>
      </div>
    )
  }

  // ── Not found ───────────────────────────────────────────────────────────────
  if (error || !book) {
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
          href="/kiosk/catalog"
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
  // A failed eligibility call falls back to letting them try — claim_hold
  // still enforces every rule server-side.
  const borrowState: 'none' | 'checking' | 'ready' | 'blocked' =
    !session ? 'none'
    : !eligibility.checked ? (isAvailable ? 'checking' : 'none')
    : eligibility.canBorrow ? 'ready'
    : isAvailable ? 'blocked' : 'none'

  return (
    <div className="px-5 sm:px-8 py-7 max-w-5xl mx-auto">

      {/* Back */}
      <Link
        href="/kiosk/catalog"
        className="inline-flex items-center gap-1.5 text-ink-400 hover:text-green-700 transition-colors mb-7"
        style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
      >
        <ArrowLeft size={15} />
        Back to results
      </Link>

      {/* ── Two-column hero ────────────────────────────────────────────── */}
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
            className="text-ink-900 font-semibold leading-tight mb-1"
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

      {/* ── Availability / borrow action ─────────────────────────────────── */}
      <div className="mb-8">
        <ActionPanel
          available={availableCopies}
          total={totalCopies}
          isAvailable={isAvailable}
          borrow={{ state: borrowState, reason: eligibility.reason ?? undefined }}
          guestBrowsing={guestBrowsing}
          onBorrow={() => setShowBorrow(true)}
        />
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
      <div className="bg-white rounded-[10px] border border-ink-200 overflow-hidden">
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
        <div className="grid grid-cols-1 sm:grid-cols-2">
          {[
            { icon: <Hash size={14} />,      label: 'Call Number',    value: book.call_number },
            { icon: <MapPin size={14} />,     label: 'Shelf Location', value: book.shelf_location },
            { icon: <GraduationCap size={14} />, label: 'Program',  value: book.category },
            { icon: <Landmark size={14} />,      label: 'College',  value: book.subject },
            { icon: <Building2 size={14} />,  label: 'Publisher',      value: book.publisher },
            { icon: <Calendar size={14} />,   label: 'Year Published', value: book.published_year },
            { icon: <Hash size={14} />,       label: 'ISBN',           value: book.isbn },
          ]
            .filter((row) => row.value != null && row.value !== '')
            .map((row, i, rows) => {
              const isLast = i === rows.length - 1
              const isSecondToLastOfEvenRow = rows.length % 2 === 0 && i === rows.length - 2
              const hasRightNeighbor = i + 1 < rows.length
              return (
                <div
                  key={row.label}
                  className={cn(
                    'flex items-center gap-3 px-5 py-3 border-ink-100 min-w-0',
                    !isLast && (isSecondToLastOfEvenRow ? 'border-b sm:border-b-0' : 'border-b'),
                    i % 2 === 0 && hasRightNeighbor && 'sm:border-r',
                  )}
                >
                  <span className="text-ink-400 shrink-0">{row.icon}</span>
                  <span
                    className="text-ink-400 w-28 shrink-0"
                    style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)' }}
                  >
                    {row.label}
                  </span>
                  <span
                    className="text-ink-900 font-medium truncate"
                    style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                  >
                    {row.value}
                  </span>
                </div>
              )
            })}
        </div>
      </div>

      {showBorrow && session && (
        <BorrowModal book={book} stationSessionId={session.id} onClose={() => setShowBorrow(false)} />
      )}
    </div>
  )
}
