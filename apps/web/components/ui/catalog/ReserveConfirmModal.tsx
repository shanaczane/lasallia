// apps/web/components/ui/catalog/ReserveConfirmModal.tsx
// Shown when a student taps "Reserve this book" — before anything is
// placed, it tells them where they'd land in the queue and roughly when a
// copy should be ready for them, so they can decide whether the wait is
// worth it. The date is an estimate from the API (due dates of the copies
// out, plus a full loan period per person ahead), never a promise.

'use client'

import { useRef, useEffect, useState } from 'react'
import { X, Info, AlertCircle, CalendarClock, Users } from 'lucide-react'
import { fetchReservationEstimate, type ReservationEstimate } from '@/lib/reservations'
import type { Book } from '@lasallia/types'
import { useDialogKeyboard } from '@/lib/hooks/useDialogKeyboard'

type EstimateState =
  | { status: 'loading' }
  | { status: 'ready'; estimate: ReservationEstimate }
  | { status: 'error'; message: string }

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })
}

// "today" / "in about 5 days" / "in about 2 weeks" — a soft label so the
// date reads as approximate rather than a commitment.
export function relativeWait(iso: string): string {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
  if (days <= 0) return 'any time now'
  if (days === 1) return 'in about a day'
  if (days < 14) return `in about ${days} days`
  return `in about ${Math.round(days / 7)} weeks`
}

export function ReserveConfirmModal({
  book,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  book: Book
  pending: boolean
  error: string
  onConfirm: () => void
  onClose: () => void
}) {
  const [state, setState] = useState<EstimateState>({ status: 'loading' })
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogKeyboard(dialogRef, { onClose: pending ? undefined : onClose })


  useEffect(() => {
    let cancelled = false
    fetchReservationEstimate(book.id)
      .then((estimate) => { if (!cancelled) setState({ status: 'ready', estimate }) })
      .catch((err) => {
        if (!cancelled) setState({ status: 'error', message: err instanceof Error ? err.message : 'Could not estimate your wait' })
      })
    return () => { cancelled = true }
  }, [book.id])

  const blocked = state.status === 'ready' && !state.estimate.can_reserve
    ? state.estimate.reason ?? "You can't reserve this book right now."
    : null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(20,21,15,0.55)' }}
      onClick={pending ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reserve-confirm-title"
        ref={dialogRef} className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-sm p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="w-full flex items-center justify-between">
          <p
            id="reserve-confirm-title"
            className="text-ink-900 font-semibold"
            style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)' }}
          >
            Reserve this Book
          </p>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Close"
            className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-ink-100 text-ink-400 transition-colors disabled:opacity-50"
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
          </div>
        </div>

        {state.status === 'loading' && (
          <div className="flex items-center justify-center gap-2 rounded-[10px] bg-ink-50 py-6">
            <div className="w-5 h-5 rounded-full border-2 border-green-700 border-t-transparent animate-spin motion-reduce:animate-none" />
            <p className="text-ink-400" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}>
              Checking the queue…
            </p>
          </div>
        )}

        {state.status === 'error' && (
          <div className="flex items-start gap-2 rounded-[10px] bg-ink-50 border border-ink-200 p-3">
            <AlertCircle size={14} className="text-ink-400 shrink-0 mt-0.5" />
            <p className="text-ink-600" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
              We couldn&apos;t estimate your wait right now. You can still reserve — we&apos;ll notify you when a copy is ready.
            </p>
          </div>
        )}

        {/* Checked before Confirm, so an ineligible student sees why up
            front instead of getting the same error after tapping it. */}
        {blocked && (
          <div className="flex items-start gap-2 rounded-[10px] bg-danger-bg border border-danger/20 p-3">
            <AlertCircle size={14} className="text-danger shrink-0 mt-0.5" />
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--color-danger-dark)' }}>
              {blocked}
            </p>
          </div>
        )}

        {state.status === 'ready' && !blocked && (
          <div className="flex flex-col rounded-[10px] border border-ink-200 divide-y divide-ink-100">
            <div className="flex items-center gap-3 px-4 py-3">
              <Users size={16} className="text-green-700 shrink-0" />
              <div style={{ fontFamily: 'var(--font-body)' }}>
                <p className="text-ink-400" style={{ fontSize: 'var(--text-xs)' }}>Your place in line</p>
                <p className="text-ink-900 font-semibold" style={{ fontSize: 'var(--text-sm-body)' }}>
                  {state.estimate.queue_position === 1 ? "You'd be first in line" : `You'd be #${state.estimate.queue_position} in line`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <CalendarClock size={16} className="text-green-700 shrink-0" />
              <div style={{ fontFamily: 'var(--font-body)' }}>
                <p className="text-ink-400" style={{ fontSize: 'var(--text-xs)' }}>Estimated ready for pickup</p>
                {state.estimate.estimated_ready_at ? (
                  <>
                    <p className="text-ink-900 font-semibold" style={{ fontSize: 'var(--text-sm-body)' }}>
                      Around {formatDate(state.estimate.estimated_ready_at)}
                    </p>
                    <p className="text-ink-500" style={{ fontSize: 'var(--text-xs)' }}>
                      {relativeWait(state.estimate.estimated_ready_at)} · then {state.estimate.hold_period_days} {state.estimate.hold_period_days === 1 ? 'day' : 'days'} to pick it up
                    </p>
                  </>
                ) : (
                  <p className="text-ink-900 font-semibold" style={{ fontSize: 'var(--text-sm-body)' }}>
                    No return date yet
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Estimate disclaimer */}
        {!blocked && (
        <div className="w-full flex items-start gap-2 p-3 rounded-[10px] bg-warn-bg border border-warn/30">
          <Info size={14} className="text-warn shrink-0 mt-0.5" />
          <p className="text-ink-700" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
            This date is only an estimate. It can move earlier or later depending on when borrowers return the book and whether those ahead of you pick it up. We&apos;ll notify you when it&apos;s actually ready.
          </p>
        </div>
        )}

        {error && (
          <p className="text-danger" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}>
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="flex-1 py-2.5 rounded-[10px] border border-ink-200 text-ink-600 font-semibold hover:bg-ink-50 transition-colors disabled:opacity-50"
            style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
          >
            {blocked ? 'Close' : 'Not now'}
          </button>
          {!blocked && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending || state.status === 'loading'}
              className="flex-1 py-2.5 rounded-[10px] bg-green-700 text-white font-semibold hover:bg-green-800 transition-colors disabled:opacity-50"
              style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
            >
              {pending ? 'Reserving…' : 'Confirm reservation'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
