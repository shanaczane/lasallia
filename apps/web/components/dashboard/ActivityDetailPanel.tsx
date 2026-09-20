// apps/web/components/dashboard/ActivityDetailPanel.tsx
// Slide-in detail view for a Recent Activity row on the librarian dashboard.
// Shows everything known about that one event (condition, fine, dates, who
// processed it), plus the same book's other recent checkouts/returns/
// reservations so a librarian isn't stuck piecing that together by scanning
// the flat feed themselves.

'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { X, Camera } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBodyScrollLock } from '@/lib/hooks/useBodyScrollLock'
import { TX_CONFIG, timeLabel, dateLabel, type FeedItem, type TxType } from '@/lib/activity'
import type { Loan } from '@/lib/kiosk'
import type { Reservation } from '@lasallia/types'

type ActivityDetailPanelProps = {
  item: FeedItem | null
  loans: Loan[]
  reservations: Reservation[]
  onClose: () => void
}

function Field({ label, value, danger }: { label: string; value: React.ReactNode; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-ink-500 shrink-0" style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)' }}>
        {label}
      </span>
      <span
        className={cn('font-medium text-right', danger ? 'text-danger' : 'text-ink-900')}
        style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
      >
        {value}
      </span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col py-2.5 border-b border-ink-100 last:border-b-0">
      <p
        className="text-ink-400 uppercase font-semibold mb-0.5"
        style={{ fontSize: 'var(--text-2xs)', letterSpacing: 'var(--tracking-caps)', fontFamily: 'var(--font-body)' }}
      >
        {title}
      </p>
      {children}
    </div>
  )
}

// A related event for the same book, shown as a compact row — not the full
// Field/Section detail the main event above gets.
type RelatedEvent = { key: string; type: TxType; date: string; time: string; user: string }

function relatedEventsForBook(bookId: string | null, excludeId: string, loans: Loan[], reservations: Reservation[]): RelatedEvent[] {
  if (!bookId) return []
  const events: RelatedEvent[] = []

  for (const loan of loans) {
    if (loan.books?.id !== bookId) continue
    const user = loan.profiles?.full_name ?? 'Unknown patron'
    if (`checkout-${loan.id}` !== excludeId) {
      events.push({ key: `checkout-${loan.id}`, type: 'checkout', date: dateLabel(loan.borrowed_at), time: timeLabel(loan.borrowed_at), user })
    }
    if (loan.returned_at && `return-${loan.id}` !== excludeId) {
      events.push({ key: `return-${loan.id}`, type: 'return', date: dateLabel(loan.returned_at), time: timeLabel(loan.returned_at), user })
    }
  }
  for (const r of reservations) {
    const rBookId = r.books?.id ?? r.book_id
    if (rBookId !== bookId || `reserve-${r.id}` === excludeId) continue
    events.push({ key: `reserve-${r.id}`, type: 'reserve', date: dateLabel(r.requested_at), time: timeLabel(r.requested_at), user: r.profiles?.full_name ?? 'Unknown patron' })
  }

  return events.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1)).slice(0, 6)
}

export function ActivityDetailPanel({ item, loans, reservations, onClose }: ActivityDetailPanelProps) {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  })

  useBodyScrollLock(!!item)

  useEffect(() => {
    if (item) {
      setMounted(true)
      const raf = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(raf)
    }
    setVisible(false)
    const timer = setTimeout(() => setMounted(false), 300)
    return () => clearTimeout(timer)
  }, [item])

  useEffect(() => {
    if (!item) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [item])

  if (!mounted || !item) return null

  const cfg = TX_CONFIG[item.type]
  const loan = item.loan
  const reservation = item.reservation
  const book = loan?.books ?? reservation?.books

  const related = relatedEventsForBook(item.bookId, item.id, loans, reservations)

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-150 bg-black/40 transition-opacity duration-300 motion-reduce:transition-none',
          visible ? 'opacity-100' : 'opacity-0'
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Activity details"
        className={cn(
          'fixed inset-y-0 right-0 z-160 flex flex-col bg-white shadow-(--shadow-lg) w-full sm:max-w-md',
          'transition-transform duration-300 ease-out motion-reduce:transition-none',
          visible ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-ink-200 shrink-0">
          <div className="min-w-0">
            <span
              className={cn('inline-flex items-center px-2 py-0.5 rounded-pill mb-1', cfg.bg)}
              style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-2xs)' }}
            >
              <span className={cn('font-medium', cfg.text)}>{cfg.label}</span>
            </span>
            <p
              className="text-ink-900 font-semibold leading-snug truncate"
              style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-body)' }}
              title={book?.title ?? item.item}
            >
              {book?.title ?? item.item}
            </p>
            {book?.author && (
              <p className="text-ink-400 truncate" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
                {book.author}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center w-8 h-8 rounded-full text-ink-500 hover:bg-ink-100 transition-colors shrink-0"
          >
            <X size={17} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4" style={{ overscrollBehavior: 'contain' }}>
          <Section title="Patron">
            <Field label="Name" value={item.user} />
            {reservation?.profiles?.email && <Field label="Email" value={reservation.profiles.email} />}
            {item.userId && (
              <Link
                href={`/librarian/patrons?highlight=${item.userId}`}
                className="inline-block mt-0.5 text-green-700 font-medium hover:text-green-900 transition-colors"
                style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}
              >
                View patron profile →
              </Link>
            )}
          </Section>

          {loan && (
            <Section title="Loan">
              <Field label="Borrowed" value={`${dateLabel(loan.borrowed_at)} · ${timeLabel(loan.borrowed_at)}`} />
              <Field label="Due" value={new Date(loan.due_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })} />
              {loan.returned_at && (
                <Field label="Returned" value={`${dateLabel(loan.returned_at)} · ${timeLabel(loan.returned_at)}`} />
              )}
              <Field
                label="Status"
                value={loan.status === 'overdue' ? `Overdue${loan.days_overdue ? ` (${loan.days_overdue}d)` : ''}` : loan.status}
                danger={loan.status === 'overdue'}
              />
              {loan.assisted_by && <Field label="Checked out by" value="Librarian-assisted" />}
              {loan.purpose && <Field label="Purpose" value={loan.purpose} />}
            </Section>
          )}

          {loan && (loan.condition_at_borrow || loan.condition_at_return) && (
            <Section title="Condition">
              {loan.condition_at_borrow && <Field label="At checkout" value={loan.condition_at_borrow.replace('_', ' ')} />}
              {loan.condition_at_return && (
                <Field
                  label="At return"
                  value={loan.condition_at_return}
                  danger={loan.condition_at_return !== 'good'}
                />
              )}
              {loan.condition_notes && (
                <p className="text-ink-600 mt-1 leading-relaxed" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
                  {loan.condition_notes}
                </p>
              )}
            </Section>
          )}

          {loan && loan.fine_status && loan.fine_status !== 'none' && (
            <Section title="Fine">
              <Field
                label="Amount"
                value={`₱${(loan.fine_amount ?? 0).toFixed(2)}`}
                danger={loan.fine_status === 'unsettled'}
              />
              <Field
                label="Status"
                value={loan.fine_status === 'unsettled' ? 'Unpaid' : 'Paid'}
                danger={loan.fine_status === 'unsettled'}
              />
              {loan.receipt_number && <Field label="Receipt No." value={loan.receipt_number} />}
            </Section>
          )}

          {reservation && (
            <Section title="Reservation">
              <Field label="Requested" value={`${dateLabel(reservation.requested_at)} · ${timeLabel(reservation.requested_at)}`} />
              <Field label="Status" value={reservation.status} />
              {reservation.pickup_by && (
                <Field
                  label="Pickup by"
                  value={new Date(reservation.pickup_by).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                />
              )}
              {typeof reservation.queue_position === 'number' && (
                <Field label="Queue position" value={`#${reservation.queue_position}`} />
              )}
            </Section>
          )}

          {/* No photo-capture feature exists yet anywhere in the return/
              condition-report flow — this section is a placeholder so the
              panel already has a slot for it once that's built, rather than
              silently omitting something the librarian was told to expect. */}
          <Section title="Condition Photos">
            <div className="flex items-center gap-1.5 text-ink-400 py-0.5" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
              <Camera size={14} />
              No photos attached
            </div>
          </Section>

          {related.length > 0 && (
            <Section title="Other Activity for This Book">
              <div className="flex flex-col divide-y divide-ink-100">
                {related.map((ev) => {
                  const evCfg = TX_CONFIG[ev.type]
                  return (
                    <div key={ev.key} className="flex items-center justify-between gap-3 py-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-pill shrink-0', evCfg.bg)} style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-2xs)' }}>
                          <span className={cn('font-medium', evCfg.text)}>{evCfg.label}</span>
                        </span>
                        <span className="text-ink-700 truncate" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
                          {ev.user}
                        </span>
                      </div>
                      <span className="text-ink-400 shrink-0" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
                        {ev.date}
                      </span>
                    </div>
                  )
                })}
              </div>
            </Section>
          )}

          <div className="h-2" />
        </div>
      </div>
    </>
  )
}
