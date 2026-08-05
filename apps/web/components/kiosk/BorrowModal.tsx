// apps/web/components/kiosk/BorrowModal.tsx
// The QR-claim modal shown when a student taps "Borrow this book" —
// claims a 2-minute soft hold on the earliest available copy the instant
// it opens, then shows a QR the student's phone can scan (or "Continue on
// this laptop" for the same device) to reach /borrow/[token], where they
// type the accession number themselves. Never shows it here: the whole
// point is proving they have the actual physical book.
//
// Shared between the student portal (apps/web/app/student/catalog/[bookId])
// and the kiosk terminal (apps/web/app/kiosk/catalog/[bookId], Phase 6) —
// the only difference is where the station session comes from: an
// already-logged-in student's own JWT (student portal, default), or an
// already-open kiosk session from an RFID tap/manual login at the
// terminal (stationSessionId prop, kiosk).

'use client'

import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { X, Info, AlertCircle, Monitor } from 'lucide-react'
import { openSessionFromToken, claimHold, releaseHold, type ClaimHoldResponse } from '@/lib/kiosk'
import type { Book } from '@lasallia/types'

type ClaimState =
  | { status: 'claiming' }
  | { status: 'ready'; hold: ClaimHoldResponse }
  | { status: 'error'; message: string }

export function BorrowModal({
  book,
  stationSessionId,
  onClose,
}: {
  book: Book
  stationSessionId?: string
  onClose: () => void
}) {
  const [claim, setClaim] = useState<ClaimState>({ status: 'claiming' })

  // Claiming a hold consumes the only available copy of a single-copy
  // title, so it must run exactly once per modal open. startedRef guards
  // against React 19 dev-mode's double-invoke of effects (mount ->
  // cleanup -> mount again). openRef tracks whether the user has actually
  // closed the modal — set only from handleClose below, deliberately NOT
  // from this effect's own cleanup, since Strict Mode's synthetic
  // cleanup fires on every mount (not just a real close) and would
  // otherwise make an in-flight claim release itself the instant it
  // resolves, leaving the modal stuck on its loading spinner.
  const startedRef = useRef(false)
  const openRef = useRef(true)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    async function run() {
      try {
        const sessionId = stationSessionId ?? (await openSessionFromToken()).id
        const hold = await claimHold(book.id, sessionId)
        if (openRef.current) {
          setClaim({ status: 'ready', hold })
        } else {
          // Closed while the claim was still in flight — don't leave a
          // copy held with no UI left to release it.
          releaseHold(hold.token).catch(() => {})
        }
      } catch (err) {
        if (openRef.current) {
          setClaim({ status: 'error', message: err instanceof Error ? err.message : 'Could not start borrowing this book' })
        }
      }
    }
    run()
  }, [book.id, stationSessionId])

  function handleClose() {
    openRef.current = false
    if (claim.status === 'ready') releaseHold(claim.hold.token).catch(() => {})
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(20,21,15,0.55)' }}
      onClick={handleClose}
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
            onClick={handleClose}
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

        {claim.status === 'claiming' && (
          <div
            className="flex flex-col items-center justify-center gap-2 rounded-[10px] bg-ink-50"
            style={{ width: 'var(--width-qr-frame)', height: 'var(--height-qr-frame)' }}
          >
            <div className="w-6 h-6 rounded-full border-2 border-green-700 border-t-transparent animate-spin motion-reduce:animate-none" />
            <p className="text-ink-400" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}>
              Holding a copy for you…
            </p>
          </div>
        )}

        {claim.status === 'error' && (
          <div
            className="flex flex-col items-center justify-center gap-2 rounded-[10px] bg-danger-bg px-4 text-center"
            style={{ width: 'var(--width-qr-frame)', minHeight: 120 }}
          >
            <AlertCircle size={24} className="text-danger" />
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--color-danger-dark)' }}>
              {claim.message}
            </p>
          </div>
        )}

        {claim.status === 'ready' && (
          <>
            <div
              className="flex flex-col items-center justify-center gap-3 rounded-[10px] border border-ink-200 bg-white p-4"
            >
              <QRCodeSVG value={claim.hold.qr_url} size={168} />
              <p className="text-ink-400 text-center" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-2xs)' }}>
                Scan with your phone to continue
              </p>
            </div>

            <a
              href={claim.hold.qr_url}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[10px] border-2 border-green-700 text-green-700 font-semibold hover:bg-green-50 transition-colors"
              style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
            >
              <Monitor size={15} />
              Continue on this laptop
            </a>
          </>
        )}

        {/* Instruction */}
        <div className="w-full flex items-start gap-2 p-3 rounded-[10px] bg-green-50 border border-green-200">
          <Info size={14} className="text-green-700 shrink-0 mt-0.5" />
          <p
            className="text-green-800"
            style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}
          >
            Get the book from the shelf first — you&apos;ll need the number printed on its label.
          </p>
        </div>

        <button
          onClick={handleClose}
          className="w-full py-2.5 rounded-[10px] border border-ink-200 text-ink-600 font-semibold hover:bg-ink-50 transition-colors"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
