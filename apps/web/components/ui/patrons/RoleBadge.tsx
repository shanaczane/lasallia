// apps/web/components/ui/patrons/RoleBadge.tsx
// Sprint 5.5.1 — role column badge

import { cn } from "@/lib/utils"
import type { UserRole } from "@lasallia/types"
import { ROLE_LABEL } from "@/lib/mock/patrons"

const CFG: Record<UserRole, string> = {
  student:   "bg-info-bg text-info",
  faculty:   "bg-gold-100 text-gold-600",
  librarian: "bg-green-100 text-green-800",
  guest:     "bg-ink-100 text-ink-500",
}

export function RoleBadge({ role, className }: { role: UserRole; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full font-semibold",
        CFG[role],
        className
      )}
      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-micro)" }}
    >
      {ROLE_LABEL[role]}
    </span>
  )
}