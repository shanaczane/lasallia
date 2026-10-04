// apps/web/components/ui/catalog/Pagination.tsx
// Client-side pagination for catalog grids/lists — pairs with a results
// array already fetched, filtered, and sorted in memory.
'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type PaginationProps = {
  page: number
  totalPages: number
  onChange: (page: number) => void
  // No margin by default — a caller embedding this inline next to other
  // content (e.g. a "Showing X of Y" count in a flex row, as ReportTableCard
  // and the patrons page do) would otherwise get pushed out of alignment
  // with its siblings. Pass "mt-8" explicitly for the standalone-below-a-
  // grid usage (catalog pages, borrow-return) that wants that spacing.
  className?: string
}

function pageWindow(page: number, totalPages: number): Array<number | 'ellipsis'> {
  const delta = 1
  const left = Math.max(2, page - delta)
  const right = Math.min(totalPages - 1, page + delta)

  const range: Array<number | 'ellipsis'> = [1]
  if (left > 2) range.push('ellipsis')
  for (let i = left; i <= right; i++) range.push(i)
  if (right < totalPages - 1) range.push('ellipsis')
  if (totalPages > 1) range.push(totalPages)

  return range
}

export function Pagination({ page, totalPages, onChange, className }: PaginationProps) {
  if (totalPages <= 1) return null

  return (
    <nav aria-label="Catalog pages" className={cn('flex items-center justify-center gap-2', className)}>
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        aria-label="Previous page"
        className="flex items-center justify-center w-9 h-9 rounded-lg text-ink-500 hover:bg-ink-100 disabled:opacity-30 disabled:pointer-events-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-1"
      >
        <ChevronLeft size={16} />
      </button>

      {pageWindow(page, totalPages).map((p, i) =>
        p === 'ellipsis' ? (
          <span
            key={`ellipsis-${i}`}
            className="w-9 h-9 flex items-center justify-center text-ink-400"
            style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
          >
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={cn(
              'w-9 h-9 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-1',
              p === page ? 'bg-green-700 text-white font-semibold' : 'text-ink-600 hover:bg-ink-100'
            )}
            style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
          >
            {p}
          </button>
        )
      )}

      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        aria-label="Next page"
        className="flex items-center justify-center w-9 h-9 rounded-lg text-ink-500 hover:bg-ink-100 disabled:opacity-30 disabled:pointer-events-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-1"
      >
        <ChevronRight size={16} />
      </button>
    </nav>
  )
}
