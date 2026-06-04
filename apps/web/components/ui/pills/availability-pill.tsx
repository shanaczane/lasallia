 import { cn } from "@/lib/utils"

type AvailabilityStatus = "available" | "borrowed" | "reserved" | "missing"

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