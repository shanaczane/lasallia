// apps/web/components/ui/catalog/CopyManagementTable.tsx
// Sprint 5.2.4 — Copy management table (per-copy status, read-only)
// Fix: wired to real book_copies data (GET /books/{id}/copies) instead of
// rows fabricated from total_copies/available_copies. There's no backend
// endpoint for a librarian to freely set a copy's status or create one
// ad hoc — the status machine (apps/api migration 0004) only moves through
// real flows (borrow/return, reshelving, mark-found), and copies are
// created by the accession process, not here — so this is display-only.
// Borrower/due date come from the copy's matching active loan (joined in
// server-side); shelf location comes from the book itself, not the copy —
// book_copies.shelf_location is never actually populated (every row in the
// DB reads the literal string "Unassigned"), since a copy shelves wherever
// its title does. See app/librarian/catalog/[bookId]/page.tsx.

'use client'

import { MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { copyStatusConfig } from '@/lib/copyStatus'

// ─── Types ────────────────────────────────────────────────────────────────────

export type BookCopy = {
  id: string
  accession_number: string
  status: string
  shelf_location: string | null
  borrower_name: string | null
  due_date: string | null
}

type CopyManagementTableProps = {
  copies: BookCopy[]
  // The book's own shelf location — same for every copy of this title (see
  // header comment). Omitted entirely rather than showing "Unassigned" for
  // a title that genuinely has none yet.
  shelfLocation?: string | null
  className?: string
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function CopyStatusBadge({ status }: { status: string }) {
  const cfg = copyStatusConfig(status)
  return (
    <span
      className={cn('inline-flex items-center px-2.5 py-1 rounded-full font-semibold whitespace-nowrap', cfg.bg, cfg.text)}
      style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}
    >
      {cfg.label}
    </span>
  )
}

function formatDueDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Borrower cell (name + due date, on_loan/overdue copies only) ─────────────

function BorrowerInfo({ copy }: { copy: BookCopy }) {
  if (!copy.borrower_name) return <span className="text-ink-300">—</span>
  const overdue = copy.due_date ? new Date(copy.due_date) < new Date() : false
  return (
    <div className="flex flex-col">
      <span className="text-ink-900 font-medium">{copy.borrower_name}</span>
      {copy.due_date && (
        <span className={cn(overdue ? 'text-[#B91C1C]' : 'text-ink-400')} style={{ fontSize: 'var(--text-xs)' }}>
          Due {formatDueDate(copy.due_date)}
        </span>
      )}
    </div>
  )
}

// ─── Mobile card view (< md) ──────────────────────────────────────────────────

function CopyCard({ copy, shelfLocation }: { copy: BookCopy; shelfLocation?: string | null }) {
  return (
    <div className="flex flex-col gap-2 p-4 bg-white border border-ink-200 rounded-(--radius) shadow-(--shadow-sm)">
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-ink-700"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm-body)' }}
        >
          {copy.accession_number}
        </span>
        <CopyStatusBadge status={copy.status} />
      </div>
      {copy.borrower_name && (
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
          <BorrowerInfo copy={copy} />
        </div>
      )}
      {shelfLocation && (
        <p
          className="flex items-center gap-1.5 text-ink-500"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}
        >
          <MapPin size={12} className="shrink-0" />
          {shelfLocation}
        </p>
      )}
    </div>
  )
}

// ─── Main exported component ──────────────────────────────────────────────────

export function CopyManagementTable({ copies, shelfLocation, className }: CopyManagementTableProps) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>

      <p
        className="text-ink-500"
        style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
      >
        {copies.length} {copies.length === 1 ? 'copy' : 'copies'} registered
      </p>

      {/* Empty state */}
      {copies.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-center border border-ink-100 rounded-(--radius) bg-ink-50">
          <p
            className="text-ink-400"
            style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
          >
            No copies registered for this title yet.
          </p>
        </div>
      )}

      {copies.length > 0 && (
        <>
          {/* Mobile: card stack */}
          <div className="flex flex-col gap-3 md:hidden">
            {copies.map((copy) => (
              <CopyCard key={copy.id} copy={copy} shelfLocation={shelfLocation} />
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block w-full overflow-x-auto rounded-(--radius) border border-ink-200">
            <table className="w-full border-collapse text-left" style={{ minWidth: 560 }}>
              <thead>
                <tr className="bg-ink-50 border-b border-ink-200">
                  {['Accession #', 'Status', 'Borrower', 'Shelf Location'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-ink-500 font-semibold uppercase whitespace-nowrap"
                      style={{
                        fontSize: 'var(--text-2xs)',
                        letterSpacing: 'var(--tracking-eyebrow)',
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {copies.map((copy, idx) => (
                  <tr
                    key={copy.id}
                    className={cn(
                      'border-b border-ink-100 last:border-b-0 transition-colors hover:bg-ink-50',
                      idx % 2 === 0 ? 'bg-white' : 'bg-[#FAFAF5]'
                    )}
                  >
                    <td
                      className="px-4 py-3 text-ink-700"
                      style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-mono)' }}
                    >
                      {copy.accession_number}
                    </td>
                    <td className="px-4 py-3">
                      <CopyStatusBadge status={copy.status} />
                    </td>
                    <td
                      className="px-4 py-3"
                      style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                    >
                      <BorrowerInfo copy={copy} />
                    </td>
                    <td
                      className="px-4 py-3 text-ink-600"
                      style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                    >
                      {shelfLocation ?? <span className="text-ink-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
