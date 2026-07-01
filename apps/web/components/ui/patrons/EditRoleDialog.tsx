// apps/web/components/ui/patrons/EditRoleDialog.tsx
// Sprint 5.5.3 — edit role modal

"use client"

import { useState } from "react"
import { X, UserCog } from "lucide-react"
import { cn } from "@/lib/utils"
import type { UserProfile, UserRole } from "@lasallia/types"
import { ROLE_LABEL } from "@/lib/mock/patrons"

const EDITABLE_ROLES: UserRole[] = ["student", "faculty", "librarian"]

type EditRoleDialogProps = {
  patron: UserProfile
  onClose: () => void
  onConfirm: (userId: string, newRole: UserRole) => void
}

export function EditRoleDialog({ patron, onClose, onConfirm }: EditRoleDialogProps) {
  const [role, setRole] = useState<UserRole>(patron.role === "guest" ? "student" : patron.role)

  return (
    <div className="fixed inset-0 z-(--z-modal) flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-900/40" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white rounded-(--radius-lg) shadow-(--shadow-lg) p-6">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-100 text-green-800 shrink-0">
              <UserCog size={18} />
            </div>
            <div>
              <h2 className="text-ink-900 font-semibold" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-2xl)" }}>
                Edit Role
              </h2>
              <p className="text-ink-400" style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}>
                {patron.full_name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center w-8 h-8 rounded-sm text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-2.5 mb-6">
          {EDITABLE_ROLES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={cn(
                "flex items-center justify-between px-4 py-3 rounded-(--radius) border transition-colors text-left",
                role === r
                  ? "border-green-700 bg-green-50 text-green-800 font-semibold"
                  : "border-ink-200 text-ink-700 hover:bg-ink-50"
              )}
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
            >
              {ROLE_LABEL[r]}
              {role === r && <span className="w-2 h-2 rounded-full bg-green-700" />}
            </button>
          ))}
        </div>

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
            onClick={() => onConfirm(patron.id, role)}
            disabled={role === patron.role}
            className="px-4 py-2 rounded-sm bg-green-700 text-white hover:bg-green-800 disabled:opacity-40 disabled:pointer-events-none transition-colors font-semibold"
            style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}