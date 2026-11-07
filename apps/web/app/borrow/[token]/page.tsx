// The borrow form, opened from the QR code (or on the same device). The
// phone must be signed in as the borrower — the same account as the ID
// tapped at the kiosk. Signing in comes back here afterwards.
//
// The accession number is never shown; the student types it from the book's
// label, which proves they have it. A kiosk borrow then finishes with a
// second ID tap at the kiosk.

'use client'

import { formatDate } from "@/lib/dueDates"
import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  MapPin, Hash, Clock, CheckCircle2, AlertCircle,
  User, ArrowLeft, XCircle, RotateCcw, WifiOff, IdCard, ShieldAlert,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BookCover } from '@/components/ui/catalog/BookCover'
import {
  fetchHold, verifyHold, fetchHoldStatus, extendHold, reportMissing, releaseHold,
  NetworkError, NotYourBorrowError, SignInRequiredError, type HoldDetail, type Condition,
} from '@/lib/kiosk'
import { clearSession, getToken, setReturnTo } from '@/lib/auth'

// How often the phone checks whether the kiosk tap has happened.
const STATUS_POLL_MS = 2000

const CONDITION_OPTIONS: Array<{ value: Condition; label: string }> = [
  { value: 'good', label: 'Good' },
  { value: 'minor_wear', label: 'Minor wear' },
  { value: 'already_damaged', label: 'Already damaged' },
]

// Counts down from the server's seconds_left, so a device with a wrong
// clock still shows the right time.
function useCountdown(deadline: number | null) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  useEffect(() => {
    if (deadline === null) return
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [deadline])

  return secondsLeft
}

function deadlineFrom(secondsLeft: number): number {
  return Date.now() + secondsLeft * 1000
}

function BibRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-ink-400 shrink-0">{icon}</span>
      <span className="text-ink-500" style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)' }}>
        {label}:
      </span>
      <span className="text-ink-900 font-medium truncate" style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}>
        {value}
      </span>
    </div>
  )
}

export default function BorrowFormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)

  const catalogHref = '/user/catalog'
  const catalogLabel = 'Back to catalog'

  // Sign in first, then come back to this page.
  function goToSignIn(signOutFirst = false) {
    if (signOutFirst) clearSession()
    setReturnTo(`/borrow/${token}`)
    router.replace('/login')
  }

  // Signed in, but not as the borrower.
  const [wrongAccount, setWrongAccount] = useState('')
  // The phone part is done; waiting for the second ID tap at the kiosk.
  const [awaitingTap, setAwaitingTap] = useState<{ deadline: number } | null>(null)

  const [hold, setHold] = useState<HoldDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  // The connection failed (not the link), so offer "Try again".
  const [loadFailedOffline, setLoadFailedOffline] = useState(false)
  // Bumped by "Try again" to rerun the load below.
  const [loadAttempt, setLoadAttempt] = useState(0)

  const [accessionNumber, setAccessionNumber] = useState('')
  const [condition, setCondition] = useState<Condition>('good')
  const [purpose, setPurpose] = useState('')
  const [notes, setNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitFailedOffline, setSubmitFailedOffline] = useState(false)
  const [confirmed, setConfirmed] = useState<{ dueDate: string } | null>(null)

  const [extending, setExtending] = useState(false)
  const [reportingMissing, setReportingMissing] = useState(false)
  const [reportedMissing, setReportedMissing] = useState(false)
  const [releasing, setReleasing] = useState(false)
  const router = useRouter()

  // Leaving frees the copy right away instead of waiting for the timeout.
  async function handleCancel() {
    if (releasing) return
    setReleasing(true)
    try {
      await releaseHold(token)
    } catch {
      // Best-effort — the hold still times out on its own.
    }
    router.push(catalogHref)
  }

  const [deadline, setDeadline] = useState<number | null>(null)
  const secondsLeft = useCountdown(deadline)

  async function handleExtend() {
    if (!hold || extending) return
    setExtending(true)
    setSubmitError('')
    try {
      const { expires_at, seconds_left, can_extend } = await extendHold(token)
      setHold({ ...hold, expires_at, seconds_left, can_extend })
      setDeadline(deadlineFrom(seconds_left))
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not extend — please rescan at the kiosk')
    } finally {
      setExtending(false)
    }
  }

  async function handleCantFindIt() {
    if (reportingMissing) return
    setReportingMissing(true)
    try {
      await reportMissing(token)
    } finally {
      // Best-effort — the flow ends here either way so the student isn't stuck.
      setReportingMissing(false)
      setReportedMissing(true)
    }
  }

  useEffect(() => {
    let cancelled = false
    if (!getToken()) {
      goToSignIn()
      return
    }
    fetchHold(token)
      .then((d) => {
        if (cancelled) return
        setHold(d)
        setDeadline(deadlineFrom(d.seconds_left))
        // Opened again after the phone part was done.
        if (d.awaiting_tap) setAwaitingTap({ deadline: deadlineFrom(d.seconds_left) })
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof SignInRequiredError) {
          goToSignIn(true)
          return
        }
        if (err instanceof NotYourBorrowError) {
          setWrongAccount(err.message)
          return
        }
        setLoadFailedOffline(err instanceof NetworkError)
        setLoadError(err instanceof Error ? err.message : 'This hold could not be found')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // goToSignIn only uses the token and router.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, loadAttempt])

  // Waiting for the kiosk tap: check until the loan exists.
  useEffect(() => {
    if (!awaitingTap) return
    let stopped = false
    async function check() {
      try {
        const s = await fetchHoldStatus(token)
        if (stopped) return
        if (s.status === 'borrowed') {
          setAwaitingTap(null)
          setConfirmed({ dueDate: s.due_date ?? '' })
        } else if (s.status === 'gone') {
          setAwaitingTap(null)
          setLoadError('Time ran out before your ID was tapped at the kiosk. Please start again at the kiosk.')
        }
      } catch {
        // A missed check is fine; the next one will catch up.
      }
    }
    const id = setInterval(check, STATUS_POLL_MS)
    return () => { stopped = true; clearInterval(id) }
  }, [awaitingTap, token])

  function retryLoad() {
    setLoadError('')
    setLoadFailedOffline(false)
    setLoading(true)
    setLoadAttempt((n) => n + 1)
  }

  // Phones pause timers with the screen off, so re-sync when visible again.
  useEffect(() => {
    if (!hold || confirmed || reportedMissing) return
    function resync() {
      if (document.visibilityState !== 'visible') return
      fetchHold(token)
        .then((d) => {
          setHold(d)
          setDeadline(deadlineFrom(d.seconds_left))
        })
        .catch(() => setDeadline(Date.now()))
    }
    document.addEventListener('visibilitychange', resync)
    return () => document.removeEventListener('visibilitychange', resync)
  }, [token, hold, confirmed, reportedMissing])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!accessionNumber.trim()) return
    setSubmitting(true)
    setSubmitError('')
    setSubmitFailedOffline(false)
    try {
      const result = await verifyHold({ token, accessionNumber, condition, purpose, notes })
      if (result.status === 'awaiting_tap') {
        // The server allows extra time to walk back to the kiosk.
        setDeadline(deadlineFrom(result.seconds_left ?? 0))
        setAwaitingTap({ deadline: deadlineFrom(result.seconds_left ?? 0) })
      } else {
        setConfirmed({ dueDate: result.due_date ?? '' })
      }
    } catch (err) {
      if (err instanceof SignInRequiredError) {
        goToSignIn(true)
        return
      }
      const message = err instanceof Error ? err.message : 'Could not confirm this loan'
      // The borrow was cancelled, so the form can't be used again.
      if (message.startsWith('Too many wrong attempts')) {
        setLoadError(message)
        return
      }
      setSubmitError(message)
      // A wrong number gets cleared for retyping; after a dropped connection
      // the number was fine, so keep it and let them just tap Try again.
      if (!(err instanceof NetworkError)) setAccessionNumber('')
      setSubmitFailedOffline(err instanceof NetworkError)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--color-paper)' }}>
        <div className="w-8 h-8 rounded-full border-2 border-green-700 border-t-transparent animate-spin motion-reduce:animate-none" />
      </div>
    )
  }

  // ── Signed in as someone other than the borrower ─────────────────────────
  if (wrongAccount) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center gap-4" style={{ backgroundColor: 'var(--color-paper)' }}>
        <div className="w-14 h-14 rounded-full bg-danger-bg flex items-center justify-center">
          <ShieldAlert size={26} className="text-danger" />
        </div>
        <div>
          <p className="text-ink-900 font-semibold mb-1" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)' }}>
            This isn&apos;t your borrow
          </p>
          <p className="text-ink-500 max-w-xs" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
            {wrongAccount}
          </p>
        </div>
        <button
          type="button"
          onClick={() => goToSignIn(true)}
          className="flex items-center justify-center gap-2 px-6 h-11 rounded-xl bg-green-700 text-white font-semibold hover:bg-green-800 transition-colors"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
        >
          Sign in with a different account
        </button>
      </div>
    )
  }

  // ── Connection problem loading the hold ──────────────────────────────────
  // The link may still work, so offer a retry.
  if (loadError && loadFailedOffline) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center gap-4" style={{ backgroundColor: 'var(--color-paper)' }}>
        <div className="w-14 h-14 rounded-full bg-ink-100 flex items-center justify-center">
          <WifiOff size={26} className="text-ink-400" />
        </div>
        <div>
          <p className="text-ink-900 font-semibold mb-1" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)' }}>
            Couldn&apos;t load your borrowing request
          </p>
          <p className="text-ink-500 max-w-xs" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
            {loadError}
          </p>
        </div>
        <button
          type="button"
          onClick={retryLoad}
          className="flex items-center justify-center gap-2 px-6 h-11 rounded-xl bg-green-700 text-white font-semibold hover:bg-green-800 transition-colors"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
        >
          <RotateCcw size={15} />
          Try again
        </button>
        <Link
          href={catalogHref}
          className="flex items-center gap-1.5 text-ink-400 hover:text-green-700 transition-colors"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}
        >
          <ArrowLeft size={14} />
          {catalogLabel}
        </Link>
      </div>
    )
  }

  // ── Terminal error states (expired, already used, too many attempts) ────
  if (loadError || !hold) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center gap-4" style={{ backgroundColor: 'var(--color-paper)' }}>
        <div className="w-14 h-14 rounded-full bg-ink-100 flex items-center justify-center">
          <AlertCircle size={26} className="text-ink-400" />
        </div>
        <div>
          <p className="text-ink-900 font-semibold mb-1" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)' }}>
            This link isn&apos;t valid anymore
          </p>
          <p className="text-ink-500 max-w-xs" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
            {loadError || 'Please go back to the kiosk and start again.'}
          </p>
        </div>
        <Link
          href={catalogHref}
          className="flex items-center gap-1.5 text-ink-400 hover:text-green-700 transition-colors"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}
        >
          <ArrowLeft size={14} />
          {catalogLabel}
        </Link>
      </div>
    )
  }

  // ── Reported missing ─────────────────────────────────────────────────────
  // The hold is gone now, so link forward, not back.
  if (reportedMissing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center gap-4" style={{ backgroundColor: 'var(--color-paper)' }}>
        <div className="w-14 h-14 rounded-full bg-ink-100 flex items-center justify-center">
          <AlertCircle size={26} className="text-ink-400" />
        </div>
        <div>
          <p className="text-ink-900 font-semibold mb-1" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)' }}>
            Thanks for letting us know
          </p>
          <p className="text-ink-500 max-w-xs" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
            We&apos;ve flagged this copy for a librarian to check. Please see the front desk if you still need this title.
          </p>
        </div>
        <Link
          href={catalogHref}
          className="flex items-center gap-1.5 text-ink-400 hover:text-green-700 transition-colors"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}
        >
          <ArrowLeft size={14} />
          {catalogLabel}
        </Link>
      </div>
    )
  }

  // ── Success ──────────────────────────────────────────────────────────────
  // No Back link: the hold is gone after borrowing, so link forward.
  if (confirmed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center gap-4" style={{ backgroundColor: 'var(--color-paper)' }}>
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 size={30} className="text-green-700" />
        </div>
        <div>
          <p className="text-ink-900 font-semibold mb-1" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)' }}>
            You&apos;ve borrowed this book
          </p>
          <p className="text-ink-500" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-body)' }}>
            {hold.book.title}
          </p>
          <p className="text-green-700 font-semibold mt-2" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
            Due date: {formatDate(confirmed.dueDate)}
          </p>
        </div>
        <div className="flex flex-col items-center gap-3 mt-2">
          <Link
            href="/user/library"
            className="h-11 px-6 flex items-center justify-center rounded-xl bg-green-700 text-white font-semibold hover:bg-green-800 active:bg-green-900 transition-colors"
            style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
          >
            View in My Library
          </Link>
          <Link
            href={catalogHref}
            className="flex items-center gap-1.5 text-ink-400 hover:text-green-700 transition-colors"
            style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}
          >
            <ArrowLeft size={14} />
            {catalogLabel}
          </Link>
        </div>
      </div>
    )
  }

  // ── Phone part done: tap the ID at the kiosk ─────────────────────────────
  if (awaitingTap) {
    const left = secondsLeft ?? 0
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center gap-4" style={{ backgroundColor: 'var(--color-paper)' }} aria-live="polite">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <IdCard size={30} className="text-green-700" />
        </div>
        <div>
          <p className="text-ink-900 font-semibold mb-1" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)' }}>
            Almost done — tap your ID at the kiosk
          </p>
          <p className="text-ink-500 max-w-xs" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
            Go back to the kiosk and tap the same ID you started with. {hold.book.title} is borrowed once you tap.
          </p>
        </div>
        <div
          className={cn(
            'flex items-center justify-center gap-1.5 rounded-full py-1.5 px-3',
            left === 0 ? 'bg-danger-bg text-danger' : 'bg-ink-100 text-ink-500'
          )}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
        >
          <Clock size={12} />
          {left === 0 ? 'Time is up' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} to tap`}
        </div>
        <button
          type="button"
          onClick={handleCancel}
          disabled={releasing}
          className="flex items-center justify-center gap-1.5 text-ink-400 hover:text-danger transition-colors disabled:opacity-50"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}
        >
          <XCircle size={14} />
          {releasing ? 'Releasing…' : 'Cancel borrowing'}
        </button>
      </div>
    )
  }

  const isExpired = secondsLeft === 0
  // Matches the API's "Add time" window (Library Settings).
  const showAddTime = !isExpired && hold.can_extend && secondsLeft !== null && secondsLeft <= hold.extend_window_seconds
  const addMinutes = Math.max(1, Math.round(hold.hold_duration_seconds / 60))
  const minutes = secondsLeft !== null ? Math.floor(secondsLeft / 60) : 0
  const seconds = secondsLeft !== null ? secondsLeft % 60 : 0

  return (
    <div className="min-h-screen py-8 px-4" style={{ backgroundColor: 'var(--color-paper)' }}>
      <div className="max-w-sm mx-auto flex flex-col gap-5">

        {/* Countdown */}
        <div
          className={cn(
            'flex items-center justify-center gap-1.5 rounded-full py-1.5 px-3 mx-auto',
            isExpired ? 'bg-danger-bg text-danger' : 'bg-ink-100 text-ink-500'
          )}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
        >
          <Clock size={12} />
          {isExpired ? 'Expired — please rescan at the kiosk' : `${minutes}:${String(seconds).padStart(2, '0')} remaining`}
        </div>

        {/* Running out of time — offer to add more (times from Library Settings) */}
        {showAddTime && (
          <div className="flex items-center gap-3 rounded-(--radius) border border-gold-500 bg-gold-100 p-3">
            <Clock size={16} className="text-gold-600 shrink-0" />
            <p className="flex-1 text-ink-800" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
              Almost out of time. Need more?
            </p>
            <button
              type="button"
              onClick={handleExtend}
              disabled={extending}
              className="shrink-0 h-9 px-3 rounded-lg bg-green-700 text-white font-semibold hover:bg-green-800 transition-colors disabled:opacity-50 disabled:pointer-events-none"
              style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}
            >
              {extending ? 'Adding…' : `Add ${addMinutes} minute${addMinutes === 1 ? '' : 's'}`}
            </button>
          </div>
        )}

        {/* "I can't find it" */}
        {!isExpired && (
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={handleCantFindIt}
              disabled={reportingMissing}
              className="text-ink-400 font-medium hover:text-danger disabled:opacity-50 disabled:pointer-events-none"
              style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}
            >
              {reportingMissing ? 'Reporting…' : "I can't find it"}
            </button>
          </div>
        )}

        {/* Box 1 — who's borrowing */}
        <div className="bg-white rounded-(--radius) border border-ink-200 p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center shrink-0">
            <User size={16} className="text-green-700" />
          </div>
          <div>
            <p className="text-ink-900 font-semibold" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
              Borrowing as {hold.student_first_name}
            </p>
            <p className="text-ink-400" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}>
              {hold.active_loan_count} of {hold.borrow_limit} books out
            </p>
          </div>
        </div>

        {/* Box 2 — what book (no accession number) */}
        <div className="bg-white rounded-(--radius) border border-ink-200 p-4 flex gap-3">
          <div
            className="shrink-0 rounded-sm overflow-hidden"
            style={{ width: 52, height: 72, background: hold.book.cover_color ?? '#1E3A5F' }}
          >
            {/* No picture → just the cover color, as before. */}
            <BookCover src={hold.book.cover_url} alt="" className="w-full h-full object-cover" loading="eager" fallback={null} />
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <p className="text-ink-900 font-semibold leading-snug" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
              {hold.book.title}
            </p>
            <p className="text-ink-500" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
              {hold.book.author}
            </p>
            <BibRow icon={<Hash size={12} />} label="Call no." value={hold.book.call_number} />
            <BibRow icon={<MapPin size={12} />} label="Location" value={hold.book.shelf_location} />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">

          {/* Box 3 — verification: the student's own input */}
          <div className="bg-white rounded-(--radius) border-2 border-green-700 p-4">
            <label
              htmlFor="accession"
              className="block text-ink-900 font-semibold mb-1"
              style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
            >
              Type the number on the book&apos;s label
            </label>
            <p className="text-ink-400 mb-3" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}>
              This proves you have the actual book — it&apos;s on a sticker near the barcode.
            </p>
            <input
              id="accession"
              type="text"
              value={accessionNumber}
              onChange={(e) => setAccessionNumber(e.target.value)}
              placeholder="e.g. T45136"
              autoFocus
              disabled={isExpired}
              className="w-full h-12 px-3 rounded-xl border-2 border-ink-200 bg-white text-ink-900 placeholder:text-ink-300 outline-none focus-visible:border-green-700 transition-colors disabled:opacity-50"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-base)' }}
            />
            {submitError && (
              <p className="mt-2 flex items-center gap-1.5 text-danger" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}>
                <AlertCircle size={13} className="shrink-0" />
                {submitError}
              </p>
            )}
          </div>

          {/* Box 4 — loan details (computed) */}
          <div className="bg-ink-50 rounded-(--radius) p-4">
            <p className="text-ink-400 uppercase font-semibold mb-2" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-2xs)', letterSpacing: 'var(--tracking-section)' }}>
              Loan details
            </p>
            <p className="text-ink-700" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
              Due date: <span className="font-semibold">{formatDate(hold.due_date_preview)}</span> ({hold.loan_period_days}-day loan, starting {hold.needs_kiosk_tap ? 'when you tap your ID at the kiosk' : 'the moment you confirm'})
            </p>
          </div>

          {/* Box 5 — student input: condition, purpose, notes */}
          <div className="bg-white rounded-(--radius) border border-ink-200 p-4 flex flex-col gap-3">
            <div>
              <label className="block text-ink-900 font-semibold mb-1.5" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
                Book condition <span className="text-danger">*</span>
              </label>
              <div className="flex gap-2">
                {CONDITION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCondition(opt.value)}
                    className={cn(
                      'flex-1 py-2 rounded-lg border font-medium transition-colors',
                      condition === opt.value
                        ? 'bg-green-50 border-green-700 text-green-800'
                        : 'bg-white border-ink-200 text-ink-600 hover:border-ink-300'
                    )}
                    style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="purpose" className="block text-ink-700 mb-1" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
                Purpose (optional)
              </label>
              <input
                id="purpose"
                type="text"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. thesis research"
                className="w-full h-10 px-3 rounded-lg border border-ink-200 bg-white text-ink-900 placeholder:text-ink-300 outline-none focus-visible:border-green-700 transition-colors"
                style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
              />
            </div>

            {condition !== 'good' && (
              <div>
                <label htmlFor="notes" className="block text-ink-700 mb-1" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
                  Describe the condition <span className="text-danger">*</span>
                </label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  required
                  rows={2}
                  placeholder="e.g. torn back cover, water stain on page 12"
                  className="w-full px-3 py-2 rounded-lg border border-ink-200 bg-white text-ink-900 placeholder:text-ink-300 outline-none focus-visible:border-green-700 transition-colors resize-none"
                  style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
                />
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting || isExpired || !accessionNumber.trim() || (condition !== 'good' && !notes.trim())}
            className="h-12 rounded-xl bg-green-700 text-white font-semibold hover:bg-green-800 active:bg-green-900 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
          >
            {submitting ? 'Confirming…' : submitFailedOffline ? 'Try again' : hold.needs_kiosk_tap ? 'Continue' : 'Confirm Borrow'}
          </button>
        </form>

        <button
          type="button"
          onClick={handleCancel}
          disabled={releasing || submitting}
          className="h-11 flex items-center justify-center gap-1.5 rounded-xl border border-ink-200 bg-white text-ink-600 font-semibold hover:bg-ink-50 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
        >
          <XCircle size={15} />
          {releasing ? 'Releasing…' : 'Cancel borrowing'}
        </button>

        <button
          type="button"
          onClick={handleCancel}
          disabled={releasing || submitting}
          className="flex items-center justify-center gap-1.5 text-ink-400 hover:text-green-700 transition-colors disabled:opacity-50"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}
        >
          <ArrowLeft size={14} />
          {catalogLabel}
        </button>
      </div>
    </div>
  )
}
