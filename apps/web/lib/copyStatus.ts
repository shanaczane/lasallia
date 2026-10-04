// apps/web/lib/copyStatus.ts
// Shared display config for book_copies.status (apps/api migration 0004's
// status machine — a DB trigger enforces these transitions, so this list is
// exhaustive: available, on_loan, reserved, for_reshelving, overdue, lost,
// damaged, missing). Single source for label/colors so a copy's status reads
// the same everywhere it's shown (Reports' Shelf List tab, the librarian
// catalog's Copy Management table) instead of each screen inventing its own.

export type CopyStatus =
  | 'available'
  | 'on_loan'
  | 'reserved'
  | 'for_reshelving'
  | 'overdue'
  | 'lost'
  | 'damaged'
  | 'missing'

export const COPY_STATUSES: CopyStatus[] = [
  'available', 'on_loan', 'reserved', 'for_reshelving', 'overdue', 'lost', 'damaged', 'missing',
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
}

// Falls back to the raw status string rather than throwing — a status this
// list hasn't caught up to should still render something instead of
// crashing the page it's on.
export function copyStatusConfig(status: string): { label: string; text: string; bg: string } {
  return COPY_STATUS_CONFIG[status as CopyStatus] ?? { label: status, text: 'text-ink-600', bg: 'bg-ink-100' }
}
