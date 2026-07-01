// apps/web/components/ui/patrons/ConfirmStatusDialog.tsx
// Sprint 5.5.3 — activate / deactivate confirmation modal

"use client"

import { AlertTriangle, UserCheck } from "lucide-react"
import type { UserProfile } from "@lasallia/types"

type ConfirmStatusDialogProps = {
  patron: UserProfile
  onClose: () => void
  onConfirm: (userId: string) => void
}

export function ConfirmStatusDialog({ patron, onClose, onConfirm }: ConfirmStatusDialogProps) {
  const isActive = patron.status !== "inactive"
  const nextLabel = isActive ? "Deactivate" : "Activate"

  return (
    <div className="fixed inset-0 z-(--z-modal) flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-900/40" onClick={onClose} />

      <div className="relative w-full max-w-sm bg-white rounded-(--radius-lg) shadow-(--shadow-lg) p-5">
        <div className="flex items-center justify-center w-11 h-11 rounded-full mb-3.5"
          style={{ background: isActive ? "var(--color-danger-bg)" : "var(--color-success-bg)" }}
        >
          {isActive ? (
            <AlertTriangle size={19} className="text-danger" />
          ) : (
            <UserCheck size={19} className="text-success" />
          )}
        </div>

        <h2 className="text-ink-900 font-semibold mb-1" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}>
          {nextLabel} this account?
        </h2>
        <p className="text-ink-500 mb-5" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
          {isActive ? (
            <>
              <span className="font-semibold text-ink-700">{patron.full_name}</span> will lose access to borrowing,
              reservations, and their account until reactivated.
            </>
          ) : (
            <>
              <span className="font-semibold text-ink-700">{patron.full_name}</span> will regain full access to the
              library system.
            </>
          )}
        </p>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-sm text-ink-600 hover:bg-ink-100 transition-colors font-medium"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(patron.id)}
            className={
              isActive
                ? "px-4 py-2 rounded-sm bg-danger text-white hover:bg-danger-dark transition-colors font-semibold"
                : "px-4 py-2 rounded-sm bg-green-700 text-white hover:bg-green-800 transition-colors font-semibold"
            }
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          >
            {nextLabel}
          </button>
        </div>
      </div>
    </div>
  )
}