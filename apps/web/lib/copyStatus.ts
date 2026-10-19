// Label and colors for each copy status, so a status looks the same on
// every screen.

export type CopyStatus =
  | 'available'
  | 'on_loan'
  | 'reserved'
  | 'for_reshelving'
  | 'overdue'
  | 'lost'
  | 'damaged'
  | 'missing'
  | 'misplaced'

export const COPY_STATUSES: CopyStatus[] = [
  'available', 'on_loan', 'reserved', 'for_reshelving', 'overdue', 'lost', 'damaged', 'missing', 'misplaced',
]

export const COPY_STATUS_CONFIG: Record<CopyStatus, { label: string; text: string; bg: string }> = {
  available:      { label: 'Available',      text: 'text-[#16A34A]', bg: 'bg-[#DCFCE7]' },
  on_loan:        { label: 'On Loan',         text: 'text-[#0369A1]', bg: 'bg-[#E0F2FE]' },
  reserved:       { label: 'Reserved',        text: 'text-[#C2730A]', bg: 'bg-[#FEF3C7]' },
  for_reshelving: { label: 'For Reshelving',  text: 'text-ink-600',   bg: 'bg-ink-100' },
  overdue:        { label: 'Overdue',         text: 'text-[#B91C1C]', bg: 'bg-[#FEE2E2]' },
  lost:           { label: 'Lost',            text: 'text-[#B91C1C]', bg: 'bg-[#FEE2E2]' },
  damaged:        { label: 'Damaged',         text: 'text-[#B45309]', bg: 'bg-[#FEF3C7]' },
  missing:        { label: 'Missing',         text: 'text-[#6D28D9]', bg: 'bg-[#EDE9FE]' },
  // Found on the wrong shelf by an inventory scan.
  misplaced:      { label: 'Misplaced',       text: 'text-[#9D174D]', bg: 'bg-[#FCE7F3]' },
}

// Unknown statuses show their raw name instead of crashing.
export function copyStatusConfig(status: string): { label: string; text: string; bg: string } {
  return COPY_STATUS_CONFIG[status as CopyStatus] ?? { label: status, text: 'text-ink-600', bg: 'bg-ink-100' }
}
