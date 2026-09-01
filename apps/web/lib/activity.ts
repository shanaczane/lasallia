// apps/web/lib/activity.ts
// Shared "recent activity" feed — merges loans + reservations into one
// chronological list. There's no single unified activity-log table on the
// backend, so this is derived client-side from the same real rows the rest
// of the app already fetches (not a separate fake source). Used by the
// librarian dashboard's preview widget and the Reports "Activity Log" tab
// (see app/librarian/reports/page.tsx) so both stay in sync off one source
// of truth.

import type { Loan } from './kiosk'
import type { Reservation } from '@lasallia/types'

export type TxType = 'checkout' | 'return' | 'reserve'

export type FeedItem = {
  id: string
  time: string
  date: string
  timestamp: number
  type: TxType
  user: string
  userId: string | null
  item: string
}

export const TX_CONFIG: Record<TxType, { label: string; bg: string; text: string }> = {
  checkout: { label: 'Checkout', bg: 'bg-info-bg', text: 'text-info' },
  return: { label: 'Return', bg: 'bg-success-bg', text: 'text-success' },
  reserve: { label: 'Reserve', bg: 'bg-warn-bg', text: 'text-warn' },
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

// "Today" / "Yesterday" for anything within the last two days, otherwise a
// short absolute date — keeps the common case scannable without hiding when
// something happened.
export function dateLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

// Merges loans + reservations into one feed, newest first. Callers decide
// how much of it to show (dashboard slices to a short preview, the Reports
// "Activity Log" tab paginates the full list).
export function buildFeed(loans: Loan[], reservations: Reservation[]): FeedItem[] {
  const items: FeedItem[] = []

  for (const loan of loans) {
    const borrower = loan.profiles?.full_name ?? 'Unknown patron'
    const item = loan.books?.title ?? 'Unknown title'
    items.push({
      id: `checkout-${loan.id}`,
      time: timeLabel(loan.borrowed_at),
      date: dateLabel(loan.borrowed_at),
      timestamp: new Date(loan.borrowed_at).getTime(),
      type: 'checkout',
      user: borrower,
      userId: loan.student_id ?? null,
      item,
    })
    if (loan.returned_at) {
      items.push({
        id: `return-${loan.id}`,
        time: timeLabel(loan.returned_at),
        date: dateLabel(loan.returned_at),
        timestamp: new Date(loan.returned_at).getTime(),
        type: 'return',
        user: borrower,
        userId: loan.student_id ?? null,
        item,
      })
    }
  }

  for (const r of reservations) {
    items.push({
      id: `reserve-${r.id}`,
      time: timeLabel(r.requested_at),
      date: dateLabel(r.requested_at),
      timestamp: new Date(r.requested_at).getTime(),
      type: 'reserve',
      user: r.profiles?.full_name ?? 'Unknown patron',
      userId: r.profiles?.id ?? r.user_id ?? null,
      item: r.books?.title ?? 'Unknown title',
    })
  }

  return items.sort((a, b) => b.timestamp - a.timestamp)
}
