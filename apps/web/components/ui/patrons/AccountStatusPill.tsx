// apps/web/components/ui/patrons/AccountStatusPill.tsx
// Sprint 5.5.1 — status column pill (Active / Inactive)

import { cn } from "@/lib/utils"
import type { UserAccountStatus } from "@lasallia/types"

const CFG: Record<UserAccountStatus, { label: string; style: string }> = {
  active:   { label: "Active",   style: "bg-success-bg text-success" },
  inactive: { label: "Inactive", style: "bg-ink-100 text-ink-500" },
}

export function AccountStatusPill({ status, className }: { status: UserAccountStatus; className?: string }) {
  const { label, style } = CFG[status]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-semibold",
        style,
        className
      )}
      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-micro)" }}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", status === "active" ? "bg-success" : "bg-ink-400")} />
      {label}
    </span>
  )
}