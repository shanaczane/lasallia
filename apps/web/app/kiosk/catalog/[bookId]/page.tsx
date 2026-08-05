// apps/web/app/kiosk/catalog/[bookId]/page.tsx
// Lean detail view for the kiosk terminal: cover, bib info, "Where to
// find it," availability, and Borrow. No bookmark/save, no
// recommendations, no reserve button — those need a JWT an RFID-tapped
// session doesn't have (see Phase 6 plan's Context). No accession number
// anywhere here, same rule as everywhere else in the catalog.

'use client'

import { use, useState } from 'react'
import { MapPin, Hash, QrCode } from 'lucide-react'
import { useBook } from '@/lib/hooks/useBooks'
import { useKioskSession } from '@/components/kiosk/KioskSessionProvider'
import { BorrowModal } from '@/components/kiosk/BorrowModal'
import { AvailabilityPill } from '@/components/ui/pills/availability-pill'

export default function KioskBookDetailPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params)
  const { session } = useKioskSession()
  const { book, loading, error } = useBook(bookId)
  const [showBorrow, setShowBorrow] = useState(false)

  if (loading) {
    return (
      <div className="px-6 sm:px-10 py-10 text-ink-400" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
        Loading…
      </div>
    )
  }

  if (error || !book) {
    return (
      <div className="px-6 sm:px-10 py-10 text-ink-400" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
        This book couldn&apos;t be found.
      </div>
    )
  }

  const availableCopies = book.available_copies ?? (book.status === 'available' ? 1 : 0)
  const totalCopies = book.total_copies ?? 1
  const isAvailable = book.status === 'available' && availableCopies > 0

  return (
    <div className="px-6 sm:px-10 py-10 max-w-3xl mx-auto flex flex-col sm:flex-row gap-8">
      <div
        className="shrink-0 mx-auto sm:mx-0 rounded-xl overflow-hidden"
        style={{ width: 176, aspectRatio: '2/3', background: book.cover_color ?? '#1E3A5F' }}
      >
        {book.cover_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={book.cover_url} alt="" className="w-full h-full object-cover" />
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <h1 className="text-ink-900 font-semibold" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)' }}>
          {book.title}
        </h1>
        <p className="text-ink-500" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-body)' }}>
          {book.author}
        </p>

        <div className="rounded-xl border border-ink-200 bg-ink-50 p-4 flex flex-col gap-1.5 mt-2">
          <p
            className="text-ink-400 uppercase font-semibold"
            style={{ fontSize: 'var(--text-2xs)', fontFamily: 'var(--font-body)', letterSpacing: 'var(--tracking-section)' }}
          >
            Where to find it
          </p>
          <p className="flex items-center gap-1.5 text-ink-700" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
            <MapPin size={14} /> {book.shelf_location}
          </p>
          <p className="flex items-center gap-1.5 text-ink-700" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
            <Hash size={14} /> {book.call_number}
          </p>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <AvailabilityPill status={book.status === 'misplaced' ? 'missing' : book.status} />
          <span className="text-ink-500" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
            {availableCopies} of {totalCopies} {totalCopies === 1 ? 'copy' : 'copies'} available
          </span>
        </div>

        {isAvailable && session ? (
          <button
            type="button"
            onClick={() => setShowBorrow(true)}
            className="mt-4 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-green-700 text-white font-semibold hover:bg-green-800 transition-colors w-fit"
            style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
          >
            <QrCode size={16} />
            Borrow this book
          </button>
        ) : (
          <p className="mt-4 text-ink-500" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
            No copies available right now.
          </p>
        )}
      </div>

      {showBorrow && session && (
        <BorrowModal book={book} stationSessionId={session.id} onClose={() => setShowBorrow(false)} />
      )}
    </div>
  )
}
