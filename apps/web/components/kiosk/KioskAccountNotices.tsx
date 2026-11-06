// Shown at the top of the kiosk after an ID tap: books ready to pick up
// (Pick up opens the book, where borrowing uses the copy set aside), and
// unpaid fines or overdue books, which are settled at the desk. Fines are
// only shown here, never paid.

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PackageCheck, Receipt, X } from 'lucide-react'
import type { StationSession } from '@/lib/kiosk'

function shortDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

export function KioskAccountNotices({ session }: { session: StationSession }) {
  // Hidden for the rest of this session once closed.
  const [dismissed, setDismissed] = useState<string | null>(null)
  if (dismissed === session.id) return null

  const pickups = session.ready_pickups ?? []
  const fines = session.unpaid_fines_total ?? 0
  const overdue = session.overdue_count ?? 0
  if (pickups.length === 0 && fines <= 0 && overdue === 0) return null

  const blocked = fines > 0 || overdue > 0

  return (
    <div className="mx-4 md:mx-6 mt-4 rounded-(--radius) border border-ink-200 bg-white p-4 flex flex-col gap-3" role="status">
      <div className="flex items-start justify-between gap-2">
        <p className="text-ink-900 font-semibold" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
          Hi {session.student_first_name}, a few things on your account
        </p>
        <button
          type="button"
          onClick={() => setDismissed(session.id)}
          aria-label="Hide these notices"
          className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-ink-100 text-ink-400 transition-colors shrink-0"
        >
          <X size={15} />
        </button>
      </div>

      {blocked && (
        <div className="flex items-start gap-2 rounded-lg bg-gold-100 border border-gold-500 px-3 py-2">
          <Receipt size={15} className="text-gold-600 shrink-0 mt-0.5" />
          <p className="text-ink-800" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
            {fines > 0 && <>You have <span className="font-semibold">₱{fines.toFixed(2)}</span> in unpaid fines. </>}
            {overdue > 0 && <>You have {overdue} overdue book{overdue === 1 ? '' : 's'}. </>}
            Please settle {fines > 0 && overdue > 0 ? 'these' : 'this'} at the front desk before borrowing more books.
          </p>
        </div>
      )}

      {pickups.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="flex items-center gap-1.5 text-green-800 font-semibold" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}>
            <PackageCheck size={14} />
            Ready for pickup
          </p>
          {pickups.map((p) => (
            <div key={p.reservation_id} className="flex items-center justify-between gap-3 rounded-lg bg-green-50 px-3 py-2">
              <div className="min-w-0">
                <p className="text-ink-900 font-medium truncate" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
                  {p.title}
                </p>
                {p.pickup_by && (
                  <p className="text-ink-500" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}>
                    On the hold shelf until {shortDate(p.pickup_by)}
                  </p>
                )}
              </div>
              {!blocked && (
                <Link
                  href={`/kiosk/catalog/${p.book_id}`}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-green-700 text-white font-semibold hover:bg-green-800 transition-colors"
                  style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}
                >
                  Pick up
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
