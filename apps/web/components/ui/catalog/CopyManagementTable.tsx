// apps/web/components/ui/catalog/CopyManagementTable.tsx
// Sprint 5.2.4 — Copy management table (per-copy status: Available, Checked Out, Under Repair)
// Fix: Add Copy modal wired up; responsive mobile card view below md breakpoint

'use client'

import { useState } from 'react'
import { CheckCircle2, BookX, Wrench, ChevronDown, Plus, X, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CopyStatus = 'available' | 'checked_out' | 'under_repair'

export type BookCopy = {
  id: string
  copy_number: number
  status: CopyStatus
  borrower_name?: string
  due_date?: string
  notes?: string
}

type CopyManagementTableProps = {
  copies: BookCopy[]
  bookId: string
  onStatusChange?: (copyId: string, newStatus: CopyStatus) => void
  onAddCopy?: (copy: BookCopy) => void
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

// ─── Status badge / dropdown ──────────────────────────────────────────────────

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
        className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold', config.badgeClass)}
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
            className="absolute left-0 top-full mt-1 z-50 bg-white border border-ink-200 rounded-(--radius-sm) shadow-(--shadow) py-1 min-w-40"
          >
            {(Object.entries(COPY_STATUS_CONFIG) as Array<[CopyStatus, typeof COPY_STATUS_CONFIG[CopyStatus]]>).map(
              ([status, cfg]) => (
                <li key={status}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={copy.status === status}
                    onClick={() => { onStatusChange(copy.id, status); setOpen(false) }}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 transition-colors text-left',
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

// ─── Add Copy Modal ───────────────────────────────────────────────────────────

type AddCopyModalProps = {
  isOpen: boolean
  nextCopyNumber: number
  bookId: string
  onClose: () => void
  onSubmit: (copy: BookCopy) => void
}

function AddCopyModal({ isOpen, nextCopyNumber, bookId, onClose, onSubmit }: AddCopyModalProps) {
  const [barcodeOverride, setBarcodeOverride] = useState('')
  const [status, setStatus] = useState<CopyStatus>('available')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  function handleSubmit() {
    const barcode = barcodeOverride.trim() ||
      `${bookId.padStart(4, '0')}-C${String(nextCopyNumber).padStart(3, '0')}`

    if (barcodeOverride.trim() && barcodeOverride.trim().length < 3) {
      setError('Barcode must be at least 3 characters.')
      return
    }

    const newCopy: BookCopy = {
      id: barcode,
      copy_number: nextCopyNumber,
      status,
      notes: notes.trim() || undefined,
    }
    onSubmit(newCopy)
    // reset
    setBarcodeOverride('')
    setStatus('available')
    setNotes('')
    setError('')
    onClose()
  }

  function handleClose() {
    setBarcodeOverride('')
    setStatus('available')
    setNotes('')
    setError('')
    onClose()
  }

  if (!isOpen) return null

  const autoBarcode = `${bookId.padStart(4, '0')}-C${String(nextCopyNumber).padStart(3, '0')}`

  const inputClass = cn(
    'w-full px-3 py-2 rounded-sm border bg-white text-ink-900',
    'placeholder:text-ink-300 focus:outline-none transition-colors',
    'border-ink-200 focus:border-green-700 hover:border-ink-300'
  )

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(20,21,15,0.55)' }}
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-(--shadow-lg) w-full sm:max-w-md flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100">
          <p
            className="text-ink-900 font-semibold"
            style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)' }}
          >
            Add Copy #{nextCopyNumber}
          </p>
          <button
            type="button"
            onClick={handleClose}
            className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-ink-100 text-ink-400 transition-colors"
            aria-label="Close"
          >
            <X size={17} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-4">

          {/* Barcode */}
          <div className="flex flex-col gap-1">
            <label
              className="text-ink-700 font-medium"
              style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
            >
              Copy ID / Barcode
            </label>
            <input
              type="text"
              value={barcodeOverride}
              onChange={(e) => { setBarcodeOverride(e.target.value); setError('') }}
              placeholder={autoBarcode}
              className={cn(inputClass, error && 'border-[#B91C1C] focus:border-[#B91C1C]')}
              style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-mono)' }}
            />
            {error ? (
              <p className="flex items-center gap-1 text-[#B91C1C]" style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}>
                <AlertCircle size={11} /> {error}
              </p>
            ) : (
              <p className="text-ink-400" style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}>
                Leave blank to auto-generate: <span style={{ fontFamily: 'var(--font-mono)' }}>{autoBarcode}</span>
              </p>
            )}
          </div>

          {/* Status */}
          <div className="flex flex-col gap-1">
            <label
              className="text-ink-700 font-medium"
              style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
            >
              Initial Status
            </label>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(COPY_STATUS_CONFIG) as Array<[CopyStatus, typeof COPY_STATUS_CONFIG[CopyStatus]]>).map(
                ([s, cfg]) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-full font-semibold border-2 transition-all',
                      status === s
                        ? cn(cfg.badgeClass, 'border-current')
                        : 'bg-ink-50 text-ink-500 border-ink-200 hover:border-ink-300'
                    )}
                    style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}
                  >
                    {cfg.icon}
                    {cfg.label}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1">
            <label
              className="text-ink-700 font-medium"
              style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
            >
              Notes <span className="text-ink-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Minor cover damage, donated copy…"
              className={cn(inputClass, 'resize-none')}
              style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-ink-100">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 rounded-sm border border-ink-200 text-ink-700 hover:bg-ink-50 transition-colors font-medium"
            style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="flex items-center gap-2 px-5 py-2 rounded-sm bg-green-700 text-white font-semibold hover:bg-green-800 active:bg-green-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-1"
            style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
          >
            <Plus size={14} />
            Add Copy
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Mobile card view (< md) ──────────────────────────────────────────────────

function CopyCard({
  copy,
  onStatusChange,
}: {
  copy: BookCopy
  onStatusChange?: (copyId: string, newStatus: CopyStatus) => void
}) {
  return (
    <div className="flex flex-col gap-2 p-4 bg-white border border-ink-200 rounded-(--radius) shadow-(--shadow-sm)">
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-ink-500 font-semibold"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
        >
          Copy #{copy.copy_number}
        </span>
        <CopyStatusCell copy={copy} onStatusChange={onStatusChange} />
      </div>
      <p
        className="text-ink-400"
        style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
      >
        {copy.id}
      </p>
      {copy.borrower_name && (
        <p
          className="text-ink-700 font-medium"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
        >
          Borrower: {copy.borrower_name}
        </p>
      )}
      {copy.due_date && (
        <p
          className={cn(
            'font-medium',
            new Date(copy.due_date) < new Date() ? 'text-[#B91C1C]' : 'text-ink-700'
          )}
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
        >
          Due:{' '}
          {new Date(copy.due_date).toLocaleDateString('en-PH', {
            month: 'short', day: 'numeric', year: 'numeric',
          })}
        </p>
      )}
      {copy.notes && (
        <p
          className="text-ink-400"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}
        >
          {copy.notes}
        </p>
      )}
    </div>
  )
}

// ─── Main exported component ──────────────────────────────────────────────────

export function CopyManagementTable({
  copies,
  bookId,
  onStatusChange,
  onAddCopy,
  className,
}: CopyManagementTableProps) {
  const [addOpen, setAddOpen] = useState(false)

  const nextCopyNumber = copies.length > 0
    ? Math.max(...copies.map((c) => c.copy_number)) + 1
    : 1

  function handleAddCopy(copy: BookCopy) {
    onAddCopy?.(copy)
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>

      {/* Header row with Add Copy button */}
      <div className="flex items-center justify-between gap-3">
        <p
          className="text-ink-500"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
        >
          {copies.length} {copies.length === 1 ? 'copy' : 'copies'} registered
        </p>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-green-700 text-white font-semibold hover:bg-green-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-1 shrink-0"
          style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
        >
          <Plus size={13} />
          Add Copy
        </button>
      </div>

      {/* Empty state */}
      {copies.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-center border border-ink-100 rounded-(--radius) bg-ink-50">
          <p
            className="text-ink-400 mb-3"
            style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
          >
            No copies registered yet.
          </p>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-sm bg-green-700 text-white font-semibold hover:bg-green-800 transition-colors"
            style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
          >
            <Plus size={13} />
            Add First Copy
          </button>
        </div>
      )}

      {copies.length > 0 && (
        <>
          {/* Mobile: card stack */}
          <div className="flex flex-col gap-3 md:hidden">
            {copies.map((copy) => (
              <CopyCard key={copy.id} copy={copy} onStatusChange={onStatusChange} />
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block w-full overflow-x-auto rounded-(--radius) border border-ink-200">
            <table className="w-full border-collapse text-left" style={{ minWidth: 520 }}>
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
                    <td
                      className="px-4 py-3 text-ink-500 font-semibold tabular-nums"
                      style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                    >
                      #{copy.copy_number}
                    </td>
                    <td
                      className="px-4 py-3 text-ink-500"
                      style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}
                    >
                      {copy.id}
                    </td>
                    <td className="px-4 py-3">
                      <CopyStatusCell copy={copy} onStatusChange={onStatusChange} />
                    </td>
                    <td
                      className="px-4 py-3 text-ink-700"
                      style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                    >
                      {copy.borrower_name
                        ? <span className="font-medium">{copy.borrower_name}</span>
                        : <span className="text-ink-300">—</span>}
                    </td>
                    <td
                      className="px-4 py-3 whitespace-nowrap"
                      style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
                    >
                      {copy.due_date ? (
                        <span className={cn('font-medium', new Date(copy.due_date) < new Date() ? 'text-[#B91C1C]' : 'text-ink-700')}>
                          {new Date(copy.due_date).toLocaleDateString('en-PH', {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })}
                        </span>
                      ) : (
                        <span className="text-ink-300">—</span>
                      )}
                    </td>
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
        </>
      )}

      {/* Add Copy Modal */}
      <AddCopyModal
        isOpen={addOpen}
        nextCopyNumber={nextCopyNumber}
        bookId={bookId}
        onClose={() => setAddOpen(false)}
        onSubmit={handleAddCopy}
      />
    </div>
  )
}