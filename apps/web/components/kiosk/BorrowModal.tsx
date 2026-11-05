// "Borrow this book": holds a copy and shows a QR code. On the phone, the
// student signs in with their own account and types the accession number
// from the book itself, which proves they have it (so it's never shown here).
//
// At the kiosk, the loan is only created after a second ID tap, so this
// window follows the borrow: waiting for the phone, then asking for the tap.
// On the web (the student's login) the phone step finishes it.

'use client'

import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { X, Info, AlertCircle, Monitor, RotateCcw, IdCard, CheckCircle2 } from 'lucide-react'
import {
  openSessionFromToken, claimHold, releaseHold, fetchHoldStatus, confirmTap, NetworkError,
  type ClaimHoldResponse,
} from '@/lib/kiosk'
import type { Book } from '@lasallia/types'
import { useDialogKeyboard } from '@/lib/hooks/useDialogKeyboard'
import { useOptionalKioskSession } from '@/components/kiosk/KioskSessionProvider'

// How often the window checks on the phone's progress.
const STATUS_POLL_MS = 2000

type ClaimState =
  | { status: 'claiming' }
  | { status: 'ready'; hold: ClaimHoldResponse; sessionId: string }
  // The phone checked the number; the kiosk waits for the second tap.
  | { status: 'awaiting_tap'; hold: ClaimHoldResponse; sessionId: string; deadline: number; tapError: string; confirming: boolean }
  | { status: 'borrowed'; dueDate: string | null }
  // Time ran out, or it was cancelled (e.g. too many wrong attempts).
  | { status: 'gone' }
  // retryable: no answer came back (connection, timeout), so retrying may work.
  | { status: 'error'; message: string; retryable: boolean }

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
}

export function BorrowModal({
  book,
  stationSessionId,
  onClose,
}: {
  book: Book
  stationSessionId?: string
  onClose: () => void
}) {
  const kiosk = useOptionalKioskSession()
  const atKiosk = !!stationSessionId
  const [claim, setClaim] = useState<ClaimState>({ status: 'claiming' })
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogKeyboard(dialogRef, { onClose: () => handleClose() })

  // The hold must be claimed once per open. startedRef stops React's dev
  // mode from claiming twice. openRef is only cleared by handleClose (not
  // effect cleanup, which dev mode also runs), so a claim isn't released
  // while it's still loading.
  const startedRef = useRef(false)
  const openRef = useRef(true)

  // Also used by "Try again". Safe to repeat: the API releases the student's
  // old hold first.
  async function startClaim() {
    setClaim({ status: 'claiming' })
    try {
      const sessionId = stationSessionId ?? (await openSessionFromToken()).id
      const hold = await claimHold(book.id, sessionId)
      if (openRef.current) {
        setClaim({ status: 'ready', hold, sessionId })
      } else {
        // Closed while claiming: release the copy.
        releaseHold(hold.token, sessionId).catch(() => {})
      }
    } catch (err) {
      if (openRef.current) {
        setClaim({
          status: 'error',
          message: err instanceof Error ? err.message : 'Could not start borrowing this book',
          retryable: err instanceof NetworkError,
        })
      }
    }
  }

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    startClaim()
    // Runs once per modal open — see startedRef above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The kiosk's idle timer waits while the borrow is live.
  const live = claim.status === 'claiming' || claim.status === 'ready' || claim.status === 'awaiting_tap'
  const setBorrowing = kiosk?.setBorrowing
  useEffect(() => {
    if (!atKiosk || !setBorrowing) return
    setBorrowing(live)
  }, [atKiosk, live, setBorrowing])
  useEffect(() => () => setBorrowing?.(false), [setBorrowing])

  // Follow the phone's progress.
  const token = claim.status === 'ready' || claim.status === 'awaiting_tap' ? claim.hold.token : null
  const sessionId = claim.status === 'ready' || claim.status === 'awaiting_tap' ? claim.sessionId : null
  useEffect(() => {
    if (!token || !sessionId) return
    let stopped = false
    async function check() {
      try {
        const s = await fetchHoldStatus(token!, sessionId!)
        if (stopped) return
        if (s.status === 'borrowed') setClaim({ status: 'borrowed', dueDate: s.due_date })
        else if (s.status === 'gone') setClaim({ status: 'gone' })
        else if (s.status === 'awaiting_tap') {
          setClaim((prev) =>
            prev.status === 'ready'
              ? { status: 'awaiting_tap', hold: prev.hold, sessionId: prev.sessionId, deadline: Date.now() + (s.seconds_left ?? 0) * 1000, tapError: '', confirming: false }
              : prev.status === 'awaiting_tap'
                ? { ...prev, deadline: Date.now() + (s.seconds_left ?? 0) * 1000 }
                : prev
          )
        }
      } catch {
        // A missed check is fine; the next one will catch up.
      }
    }
    check()
    const id = setInterval(check, STATUS_POLL_MS)
    return () => { stopped = true; clearInterval(id) }
  }, [token, sessionId])

  // The second ID tap at the kiosk confirms the loan.
  const catchNextTaps = kiosk?.catchNextTaps
  const awaitingTap = claim.status === 'awaiting_tap'
  useEffect(() => {
    if (!awaitingTap || !atKiosk || !catchNextTaps || !token || !sessionId) return
    return catchNextTaps(async (uid) => {
      setClaim((prev) => (prev.status === 'awaiting_tap' ? { ...prev, confirming: true, tapError: '' } : prev))
      try {
        const s = await confirmTap(token, sessionId, uid)
        setClaim({ status: 'borrowed', dueDate: s.due_date })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not confirm this loan'
        if (message.startsWith('Too many wrong attempts')) {
          setClaim({ status: 'error', message, retryable: false })
        } else {
          setClaim((prev) => (prev.status === 'awaiting_tap' ? { ...prev, confirming: false, tapError: message } : prev))
        }
      }
    })
  }, [awaitingTap, atKiosk, catchNextTaps, token, sessionId])

  // Seconds left to tap, counted on this screen between checks.
  const deadline = claim.status === 'awaiting_tap' ? claim.deadline : null
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (deadline === null) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [deadline])
  const tapSecondsLeft = deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000))

  function handleClose() {
    openRef.current = false
    if (claim.status === 'ready' || claim.status === 'awaiting_tap') {
      releaseHold(claim.hold.token, claim.sessionId).catch(() => {})
    }
    onClose()
  }

  const done = claim.status === 'borrowed'

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(20,21,15,0.55)' }}
      onClick={handleClose}
    >
      <div
        ref={dialogRef} role="dialog" aria-modal="true" aria-label="Borrow this book" className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-sm p-6 flex flex-col items-center gap-4"
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
            aria-label="Close"
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

        {(claim.status === 'error' || claim.status === 'gone') && (
          <div
            className="flex flex-col items-center justify-center gap-2 rounded-[10px] bg-danger-bg px-4 py-4 text-center"
            style={{ width: 'var(--width-qr-frame)', minHeight: 120 }}
          >
            <AlertCircle size={24} className="text-danger" />
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--color-danger-dark)' }}>
              {claim.status === 'gone'
                ? 'This borrow has ended — time ran out or it was cancelled. You can start again.'
                : claim.message}
            </p>
            {(claim.status === 'gone' || claim.retryable) && (
              <button
                type="button"
                onClick={startClaim}
                className="mt-1 flex items-center gap-1.5 px-4 py-2 rounded-[10px] bg-white border border-ink-200 text-ink-900 font-semibold hover:bg-ink-50 transition-colors"
                style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}
              >
                <RotateCcw size={14} />
                {claim.status === 'gone' ? 'Start again' : 'Try again'}
              </button>
            )}
          </div>
        )}

        {claim.status === 'ready' && (
          <>
            <div
              className="flex flex-col items-center justify-center gap-3 rounded-[10px] border border-ink-200 bg-white p-4"
            >
              <QRCodeSVG value={claim.hold.qr_url} size={168} />
              <p className="text-ink-500 text-center max-w-55" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}>
                Scan with your phone and sign in with your own account
              </p>
            </div>

            {/* Only on the web, where this device is already signed in as
                the borrower. The kiosk has no login. */}
            {!atKiosk && (
              <a
                href={claim.hold.qr_url}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[10px] border-2 border-green-700 text-green-700 font-semibold hover:bg-green-50 transition-colors"
                style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
              >
                <Monitor size={15} />
                Continue on this device
              </a>
            )}
          </>
        )}

        {claim.status === 'awaiting_tap' && (
          <div
            className="w-full flex flex-col items-center justify-center gap-2 rounded-[10px] border-2 border-green-700 bg-green-50 p-5 text-center"
            aria-live="polite"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-green-700">
              <IdCard size={28} />
            </div>
            <p className="text-ink-900 font-semibold" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)' }}>
              {claim.confirming ? 'Confirming…' : 'Tap your ID to confirm'}
            </p>
            <p className="text-ink-600" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
              Tap the same ID you started with to borrow this book.
            </p>
            <p className="text-ink-400" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
              {Math.floor(tapSecondsLeft / 60)}:{String(tapSecondsLeft % 60).padStart(2, '0')} left
            </p>
            {claim.tapError && (
              <p className="flex items-center gap-1.5 text-danger" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}>
                <AlertCircle size={13} className="shrink-0" />
                {claim.tapError}
              </p>
            )}
          </div>
        )}

        {claim.status === 'borrowed' && (
          <div className="w-full flex flex-col items-center justify-center gap-2 rounded-[10px] bg-green-50 p-5 text-center" aria-live="polite">
            <CheckCircle2 size={30} className="text-green-700" />
            <p className="text-ink-900 font-semibold" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)' }}>
              You&apos;ve borrowed this book
            </p>
            {claim.dueDate && (
              <p className="text-green-700 font-semibold" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
                Due back {formatDate(claim.dueDate)}
              </p>
            )}
          </div>
        )}

        {/* Instruction */}
        {claim.status === 'ready' && (
          <div className="w-full flex items-start gap-2 p-3 rounded-[10px] bg-green-50 border border-green-200">
            <Info size={14} className="text-green-700 shrink-0 mt-0.5" />
            <p
              className="text-green-800"
              style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}
            >
              Get the book from the shelf first — you&apos;ll need the number printed on its label.
              {atKiosk && ' Then come back here and tap your ID again to finish.'}
            </p>
          </div>
        )}

        <button
          onClick={done ? onClose : handleClose}
          className={
            done
              ? 'w-full py-2.5 rounded-[10px] bg-green-700 text-white font-semibold hover:bg-green-800 transition-colors'
              : 'w-full py-2.5 rounded-[10px] border border-ink-200 text-ink-600 font-semibold hover:bg-ink-50 transition-colors'
          }
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
        >
          {done ? 'Done' : 'Cancel'}
        </button>
      </div>
    </div>
  )
}
