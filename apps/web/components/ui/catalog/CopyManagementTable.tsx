// apps/web/components/ui/catalog/CopyManagementTable.tsx
// Sprint 5.2.4 — Copy management table (per-copy status: Available, Checked Out, Under Repair)

'use client'

import { useState } from 'react'
import { CheckCircle2, BookX, Wrench, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CopyStatus = 'available' | 'checked_out' | 'under_repair'

export type BookCopy = {
  id: string          // unique copy ID / barcode
  copy_number: number // 1-indexed
  status: CopyStatus
  borrower_name?: string    // present when checked_out
  due_date?: string         // ISO date when checked_out
  notes?: string
}

type CopyManagementTableProps = {
  copies: BookCopy[]
  onStatusChange?: (copyId: string, newStatus: CopyStatus) => void
  className?: string
}

// ─── Status config ────────────────────────────────────────────────────────────

const COPY_STATUS_CONFIG: Record<CopyStatus, {
  label: string
  icon: React.ReactNode
  badgeClass: string
}> = {
  available: {
    label: 'Available',
    icon: <CheckCircle2 size={13} />,
    badgeClass: 'bg-[#DCFCE7] text-[#16A34A]',
  },
  checked_out: {
    label: 'Checked Out',
    icon: <BookX size={13} />,
    badgeClass: 'bg-[#E0F2FE] text-[#0369A1]',
  },
  under_repair: {
    label: 'Under Repair',
    icon: <Wrench size={13} />,
    badgeClass: 'bg-[#FEF3C7] text-[#C2730A]',
  },
}

// ─── Status dropdown for a single copy ───────────────────────────────────────

function CopyStatusCell({
  copy,
  onStatusChange,
}: {
  copy: BookCopy
  onStatusChange?: (copyId: string, newStatus: CopyStatus) => void
}) {
  const [open, setOpen] = useState(false)
  const config = COPY_STATUS_CONFIG[copy.status]

  if (!onStatusChange) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold',
          config.badgeClass
        )}
        style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}
      >
        {config.icon}
        {config.label}
      </span>
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold transition-opacity hover:opacity-80',
          config.badgeClass
        )}
        style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {config.icon}
        {config.label}
        <ChevronDown size={10} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <ul
            role="listbox"
            className="absolute left-0 top-full mt-1 z-50 bg-white border border-ink-200 rounded-(--radius-sm) shadow-(--shadow) py-1 min-w-36"
          >
            {(Object.entries(COPY_STATUS_CONFIG) as Array<[CopyStatus, typeof COPY_STATUS_CONFIG[CopyStatus]]>).map(
              ([status, cfg]) => (
                <li key={status}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={copy.status === status}
                    onClick={() => {
                      onStatusChange(copy.id, status)
                      setOpen(false)
                    }}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-1.5 transition-colors text-left',
                      copy.status === status
                        ? 'bg-ink-50 text-ink-900 font-semibold'
                        : 'text-ink-700 hover:bg-ink-50'
                    )}
                    style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                  >
                    <span className={cn('flex items-center', cfg.badgeClass, 'bg-transparent')}>{cfg.icon}</span>
                    {cfg.label}
                  </button>
                </li>
              )
            )}
          </ul>
        </>
      )}
    </div>
  )
}

// ─── Table ────────────────────────────────────────────────────────────────────

export function CopyManagementTable({ copies, onStatusChange, className }: CopyManagementTableProps) {
  if (copies.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center py-10 text-center border border-ink-100 rounded-(--radius) bg-ink-50',
          className
        )}
      >
        <p className="text-ink-400" style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}>
          No copies registered for this book yet.
        </p>
      </div>
    )
  }

  return (
    <div className={cn('w-full overflow-x-auto rounded-(--radius) border border-ink-200', className)}>
      <table className="w-full border-collapse text-left" style={{ minWidth: 480 }}>
        <thead>
          <tr className="bg-ink-50 border-b border-ink-200">
            {['Copy #', 'Copy ID / Barcode', 'Status', 'Borrower', 'Due Date', 'Notes'].map((h) => (
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
              {/* Copy # */}
              <td
                className="px-4 py-3 text-ink-500 font-semibold tabular-nums"
                style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
              >
                #{copy.copy_number}
              </td>

              {/* Copy ID */}
              <td
                className="px-4 py-3 text-ink-500"
                style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}
              >
                {copy.id}
              </td>

              {/* Status */}
              <td className="px-4 py-3">
                <CopyStatusCell copy={copy} onStatusChange={onStatusChange} />
              </td>

              {/* Borrower */}
              <td
                className="px-4 py-3 text-ink-700"
                style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
              >
                {copy.borrower_name ? (
                  <span className="font-medium">{copy.borrower_name}</span>
                ) : (
                  <span className="text-ink-300">—</span>
                )}
              </td>

              {/* Due date */}
              <td
                className="px-4 py-3 whitespace-nowrap"
                style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
              >
                {copy.due_date ? (
                  <span
                    className={cn(
                      'font-medium',
                      new Date(copy.due_date) < new Date() ? 'text-danger' : 'text-ink-700'
                    )}
                  >
                    {new Date(copy.due_date).toLocaleDateString('en-PH', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                ) : (
                  <span className="text-ink-300">—</span>
                )}
              </td>

              {/* Notes */}
              <td
                className="px-4 py-3 text-ink-400 max-w-[160px] truncate"
                style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)' }}
                title={copy.notes}
              >
                {copy.notes ?? <span className="text-ink-200">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}