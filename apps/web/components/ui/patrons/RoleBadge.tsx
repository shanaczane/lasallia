// The user type as a text label, with the person's details when given.
// Colour only supports the words. Long lines are cut off, with the full text
// in the tooltip.

import { cn } from "@/lib/utils"
import type { UserRole } from "@lasallia/types"
import { collegeForProgram } from "@/lib/collegeForProgram"
import { roleLine } from "@/lib/roles"

const CFG: Record<UserRole, string> = {
  student:   "bg-info-bg text-info",
  faculty:   "bg-gold-100 text-gold-600",
  librarian: "bg-green-100 text-green-800",
  guest:     "bg-ink-100 text-ink-500",
}

export function RoleBadge({
  role,
  college,
  program,
  yearLevel,
  profileName,
  className,
}: {
  role: UserRole
  college?: string | null
  // Used to work out the college for profiles that have none set.
  program?: string | null
  yearLevel?: number | null
  profileName?: string | null
  className?: string
}) {
  const line = roleLine(role, { college: college ?? collegeForProgram(program), yearLevel, profileName })
  return (
    <span
      title={line}
      className={cn(
        "inline-block max-w-full min-w-[84px] truncate px-2 py-1 rounded-full font-semibold text-center leading-none",
        CFG[role],
        className
      )}
      style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-2xs)", letterSpacing: "var(--tracking-micro)" }}
    >
      {line}
    </span>
  )
}
