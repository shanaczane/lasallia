// apps/web/components/ui/patrons/PatronActionsMenu.tsx
// Sprint 5.5.3 — user account actions (activate/deactivate)
// Fix: Edit role action removed per product request

"use client"

import { useEffect, useRef, useState } from "react"
import { MoreVertical, UserCheck, UserX, Eye } from "lucide-react"
import { cn } from "@/lib/utils"
import type { UserProfile } from "@lasallia/types"

type PatronActionsMenuProps = {
  patron: UserProfile
  onView: () => void
  onToggleStatus: () => void
}

export function PatronActionsMenu({ patron, onView, onToggleStatus }: PatronActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    document.addEventListener("keydown", handleEscape)
    return () => {
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [])

  const isActive = patron.status !== "inactive"

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="User actions"
        aria-expanded={open}
        className="flex items-center justify-center w-8 h-8 rounded-sm text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition-colors"
      >
        <MoreVertical size={16} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-9 z-20 w-48 py-1.5 rounded-(--radius) bg-white border border-ink-200 shadow-(--shadow-lg)"
          role="menu"
        >
          <MenuItem icon={<Eye size={14} />} label="View profile" onClick={() => { setOpen(false); onView() }} />
          <div className="my-1 border-t border-ink-100" />
          {isActive ? (
            <MenuItem
              icon={<UserX size={14} />}
              label="Deactivate account"
              danger
              onClick={() => { setOpen(false); onToggleStatus() }}
            />
          ) : (
            <MenuItem
              icon={<UserCheck size={14} />}
              label="Activate account"
              onClick={() => { setOpen(false); onToggleStatus() }}
            />
          )}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 w-full px-3 py-2 text-left transition-colors",
        danger ? "text-danger hover:bg-danger-bg" : "text-ink-700 hover:bg-ink-50"
      )}
      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm-body)" }}
    >
      <span className={danger ? "text-danger" : "text-ink-400"}>{icon}</span>
      {label}
    </button>
  )
}