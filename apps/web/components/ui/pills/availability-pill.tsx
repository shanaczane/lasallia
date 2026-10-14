 import { cn } from "@/lib/utils"
import { isLibraryUseOnly } from "@/lib/collectionType"
import type { Book } from "@lasallia/types"

export type AvailabilityStatus = "available" | "borrowed" | "reserved" | "missing" | "misplaced" | "reference"

type AvailabilityPillProps = {
  status: AvailabilityStatus
  className?: string
}

const statusConfig: Record<AvailabilityStatus, { label: string; style: string }> = {
  available: {
    label: "Available",
    style: "bg-[#DCFCE7] text-[#16A34A]",
  },
  borrowed: {
    label: "Borrowed",
    style: "bg-[#E0F2FE] text-[#0369A1]",
  },
  reserved: {
    label: "Reserved",
    style: "bg-[#FEF3C7] text-[#C2730A]",
  },
  missing: {
    label: "Missing",
    style: "bg-[#EDE9FE] text-[#6D28D9]",
  },
  misplaced: {
    label: "Misplaced",
    style: "bg-[#FCE7F3] text-[#9D174D]",
  },
  reference: {
    label: "Reference",
    style: "bg-ink-100 text-ink-600",
  },
}

// Library-use-only items (Reference, Thesis, …) can't be borrowed, so
// "Available" would be misleading — they always show as "Reference".
export function pillStatusFor(book: Book): AvailabilityStatus {
  if (isLibraryUseOnly(book)) return "reference"
  return book.status
}

export function AvailabilityPill({ status, className }: AvailabilityPillProps) {
  const { label, style } = statusConfig[status]

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-[0.02em]",
        style,
        className
      )}
    >
      {label}
    </span>
  )
}
