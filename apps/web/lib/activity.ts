// The "recent activity" feed: loans and reservations merged into one list,
// newest first. Used by the librarian dashboard and the Activity Log report
// (which adds guests' in-house loans with inHouseFeed).

import type { Loan } from './kiosk'
import type { InHouseLoan } from './inhouse'
import type { Reservation } from '@lasallia/types'

export type TxType = 'checkout' | 'return' | 'reserve' | 'inhouse_checkout' | 'inhouse_return'

export type FeedItem = {
  id: string
  time: string
  date: string
  timestamp: number
  type: TxType
  user: string
  userId: string | null
  item: string
  bookId: string | null
  // The full record, for the activity detail panel.
  loan?: Loan
  reservation?: Reservation
}

export const TX_CONFIG: Record<TxType, { label: string; bg: string; text: string }> = {
  checkout: { label: 'Checkout', bg: 'bg-info-bg', text: 'text-info' },
  return: { label: 'Return', bg: 'bg-success-bg', text: 'text-success' },
  reserve: { label: 'Reserve', bg: 'bg-warn-bg', text: 'text-warn' },
  inhouse_checkout: { label: 'In-house checkout', bg: 'bg-gold-100', text: 'text-gold-600' },
  inhouse_return: { label: 'In-house return', bg: 'bg-ink-100', text: 'text-ink-700' },
}

// In-house (guest) items have no loan or reservation record to open.
export function isInHouse(type: TxType): boolean {
  return type === 'inhouse_checkout' || type === 'inhouse_return'
}

// Guests' in-house loans as feed items: a checkout, and a return once the
// book is back, newest first. The guest's name only, never their ID number.
export function inHouseFeed(loans: InHouseLoan[]): FeedItem[] {
  const items: FeedItem[] = []
  for (const l of loans) {
    const base = { user: `${l.guest_name} (guest)`, userId: null, item: l.books?.title ?? 'Unknown title', bookId: l.books?.id ?? null }
    items.push({
      ...base, id: `inhouse-checkout-${l.id}`, type: 'inhouse_checkout',
      time: timeLabel(l.checked_out_at), date: dateLabel(l.checked_out_at), timestamp: new Date(l.checked_out_at).getTime(),
    })
    if (l.returned_at) {
      items.push({
        ...base, id: `inhouse-return-${l.id}`, type: 'inhouse_return',
        time: timeLabel(l.returned_at), date: dateLabel(l.returned_at), timestamp: new Date(l.returned_at).getTime(),
      })
    }
  }
  return items.sort((a, b) => b.timestamp - a.timestamp)
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

// "Today", "Yesterday", or a short date.
export function dateLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

// Loans and reservations as one feed, newest first.
export function buildFeed(loans: Loan[], reservations: Reservation[]): FeedItem[] {
  const items: FeedItem[] = []

  for (const loan of loans) {
    const borrower = loan.profiles?.full_name ?? 'Unknown patron'
    const item = loan.books?.title ?? 'Unknown title'
    const bookId = loan.books?.id ?? null
    items.push({
      id: `checkout-${loan.id}`,
      time: timeLabel(loan.borrowed_at),
      date: dateLabel(loan.borrowed_at),
      timestamp: new Date(loan.borrowed_at).getTime(),
      type: 'checkout',
      user: borrower,
      userId: loan.student_id ?? null,
      item,
      bookId,
      loan,
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
        bookId,
        loan,
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
      bookId: r.books?.id ?? r.book_id ?? null,
      reservation: r,
    })
  }

  return items.sort((a, b) => b.timestamp - a.timestamp)
}
