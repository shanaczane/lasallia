// apps/web/components/chat/shared/DeleteChatModal.tsx
// Confirmation dialog for deleting a chat session — used by both
// ChatSidebar (any past conversation) and ChatHeader/ChatWindow (the
// conversation currently open). Same overlay/card shell as
// DeleteBookModal and BorrowModal, trimmed to a single action.

'use client'

import { AlertTriangle, X } from 'lucide-react'

type DeleteChatModalProps = {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
}

export function DeleteChatModal({ isOpen, onClose, onConfirm }: DeleteChatModalProps) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(20,21,15,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-(--shadow-lg) w-full sm:max-w-sm p-6 flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#FEE2E2] shrink-0">
              <AlertTriangle size={18} className="text-danger" />
            </div>
            <p
              className="text-ink-900 font-semibold"
              style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)' }}
            >
              Delete this chat?
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-ink-100 text-ink-400 transition-colors shrink-0"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        <p
          className="text-ink-600"
          style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
        >
          This conversation will be permanently deleted. This can&apos;t be undone.
        </p>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-sm border border-ink-200 text-ink-700 hover:bg-ink-50 transition-colors font-medium"
            style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-5 py-2 rounded-sm font-semibold transition-colors bg-danger text-white hover:bg-danger-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-danger"
            style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
