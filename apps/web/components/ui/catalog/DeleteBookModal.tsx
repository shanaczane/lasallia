// apps/web/components/ui/catalog/DeleteBookModal.tsx
// Sprint 5.2.5 — Book deletion / archive modal with confirmation

'use client'

import { useState } from 'react'
import { AlertTriangle, X, Archive, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Book } from '@lasallia/types'

type DeleteBookModalProps = {
  book: Book | null
  isOpen: boolean
  onClose: () => void
  onArchive?: (book: Book) => void
  onDelete?: (book: Book) => void
}

export function DeleteBookModal({ book, isOpen, onClose, onArchive, onDelete }: DeleteBookModalProps) {
  const [confirmed, setConfirmed] = useState(false)
  const [action, setAction] = useState<'archive' | 'delete' | null>(null)

  function handleClose() {
    setConfirmed(false)
    setAction(null)
    onClose()
  }

  function handleAction() {
    if (!book || !action) return
    if (action === 'archive') onArchive?.(book)
    if (action === 'delete')  onDelete?.(book)
    handleClose()
  }

  if (!isOpen || !book) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(20,21,15,0.55)' }}
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-(--shadow-lg) w-full sm:max-w-md p-6 flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#FEE2E2] shrink-0">
              <AlertTriangle size={18} className="text-danger" />
            </div>
            <div>
              <p
                className="text-ink-900 font-semibold"
                style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)' }}
              >
                Remove Book from Catalog
              </p>
              <p
                className="text-ink-500 mt-0.5 leading-snug line-clamp-1"
                style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
              >
                {book.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-ink-100 text-ink-400 transition-colors shrink-0"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Options */}
        <div className="flex flex-col gap-3">
          <p
            className="text-ink-600"
            style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
          >
            Choose how to remove this book:
          </p>

          {/* Archive option */}
          <button
            type="button"
            onClick={() => setAction('archive')}
            className={cn(
              'flex items-start gap-3 p-4 rounded-(--radius) border-2 text-left transition-all',
              action === 'archive'
                ? 'border-gold-500 bg-gold-100'
                : 'border-ink-200 bg-white hover:border-ink-300 hover:bg-ink-50'
            )}
          >
            <Archive
              size={18}
              className={cn('mt-0.5 shrink-0', action === 'archive' ? 'text-gold-600' : 'text-ink-400')}
            />
            <div>
              <p
                className={cn('font-semibold', action === 'archive' ? 'text-ink-900' : 'text-ink-700')}
                style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
              >
                Archive (recommended)
              </p>
              <p
                className="text-ink-500 mt-0.5"
                style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}
              >
                Hides the book from the catalog but preserves all borrow history and records. Can be restored later.
              </p>
            </div>
          </button>

          {/* Delete option */}
          <button
            type="button"
            onClick={() => setAction('delete')}
            className={cn(
              'flex items-start gap-3 p-4 rounded-(--radius) border-2 text-left transition-all',
              action === 'delete'
                ? 'border-danger bg-[#FEE2E2]'
                : 'border-ink-200 bg-white hover:border-ink-300 hover:bg-ink-50'
            )}
          >
            <Trash2
              size={18}
              className={cn('mt-0.5 shrink-0', action === 'delete' ? 'text-danger' : 'text-ink-400')}
            />
            <div>
              <p
                className={cn('font-semibold', action === 'delete' ? 'text-danger' : 'text-ink-700')}
                style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
              >
                Permanently delete
              </p>
              <p
                className="text-ink-500 mt-0.5"
                style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}
              >
                Removes the book and all related data permanently. This cannot be undone.
              </p>
            </div>
          </button>
        </div>

        {/* Confirm checkbox — only shown when action selected */}
        {action && (
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-ink-300 text-green-700 focus:ring-green-700 cursor-pointer"
            />
            <span
              className="text-ink-700 leading-snug"
              style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
            >
              {action === 'archive'
                ? 'I confirm I want to archive this book. It will no longer appear in the catalog.'
                : 'I understand this is permanent. I confirm deletion of this book and all its records.'}
            </span>
          </label>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-1">
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
            onClick={handleAction}
            disabled={!action || !confirmed}
            className={cn(
              'px-5 py-2 rounded-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
              !action || !confirmed
                ? 'bg-ink-200 text-ink-400 cursor-not-allowed'
                : action === 'delete'
                  ? 'bg-danger text-white hover:bg-danger-dark focus-visible:ring-danger'
                  : 'bg-gold-500 text-white hover:bg-gold-600 focus-visible:ring-gold-500'
            )}
            style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
          >
            {action === 'archive' ? 'Archive Book' : action === 'delete' ? 'Delete Permanently' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}