// apps/web/app/borrow/[token]/page.tsx
// Sprint: Phase 2 borrow happy path — the form opened via QR scan (phone)
// or "Continue on this laptop" (same device). Public route, no app login
// required — the hold token in the URL is the only credential this page
// needs (see apps/api's routers/holds.py, routers/loans.py).
//
// Box 2 (what book) intentionally has no accession number anywhere on
// this page — the student types it themselves in Box 3, off the physical
// label, as proof they actually have the book in hand.

'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  MapPin, Hash, Clock, CheckCircle2, AlertCircle,
  User, ArrowLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchHold, confirmLoan, type HoldDetail, type Condition } from '@/lib/kiosk'

// Placeholder pending real LRC policy (plan doc's open question #2) —
// display only, not enforced anywhere yet (that's Phase 3).
const BORROW_LIMIT_PLACEHOLDER = 3

const CONDITION_OPTIONS: Array<{ value: Condition; label: string }> = [
  { value: 'good', label: 'Good' },
  { value: 'minor_wear', label: 'Minor wear' },
  { value: 'already_damaged', label: 'Already damaged' },
]

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
}

function useCountdown(expiresAt: string | undefined) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  useEffect(() => {
    if (!expiresAt) return
    const tick = () => {
      const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
      setSecondsLeft(Math.max(0, diff))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt])

  return secondsLeft
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

  const [hold, setHold] = useState<HoldDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [accessionNumber, setAccessionNumber] = useState('')
  const [condition, setCondition] = useState<Condition>('good')
  const [purpose, setPurpose] = useState('')
  const [notes, setNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [confirmed, setConfirmed] = useState<{ dueDate: string } | null>(null)

  const secondsLeft = useCountdown(hold?.expires_at)

  useEffect(() => {
    let cancelled = false
    fetchHold(token)
      .then((d) => { if (!cancelled) setHold(d) })
      .catch((err) => { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'This hold could not be found') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!accessionNumber.trim()) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const loan = await confirmLoan({ token, accessionNumber, condition, purpose, notes })
      setConfirmed({ dueDate: loan.due_date })
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not confirm this loan')
      setAccessionNumber('')
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
      </div>
    )
  }

  // ── Success ──────────────────────────────────────────────────────────────
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
            Due back {formatDate(confirmed.dueDate)}
          </p>
        </div>
      </div>
    )
  }

  const isExpired = secondsLeft === 0
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
              {hold.active_loan_count} of {BORROW_LIMIT_PLACEHOLDER} books out
            </p>
          </div>
        </div>

        {/* Box 2 — what book (no accession number) */}
        <div className="bg-white rounded-(--radius) border border-ink-200 p-4 flex gap-3">
          <div
            className="shrink-0 rounded-sm overflow-hidden"
            style={{ width: 52, height: 72, background: hold.book.cover_color ?? '#1E3A5F' }}
          >
            {hold.book.cover_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hold.book.cover_url} alt="" className="w-full h-full object-cover" />
            )}
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
              Due back <span className="font-semibold">{formatDate(hold.due_date_preview)}</span> (14-day loan, starting the moment you confirm)
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
            {submitting ? 'Confirming…' : 'Confirm Borrow'}
          </button>
        </form>

        <Link
          href="/student/catalog"
          className="flex items-center justify-center gap-1.5 text-ink-400 hover:text-green-700 transition-colors"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}
        >
          <ArrowLeft size={14} />
          Back to catalog
        </Link>
      </div>
    </div>
  )
}
