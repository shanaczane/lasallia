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

export function Pagination({ page, totalPages, onChange }: PaginationProps) {
  if (totalPages <= 1) return null

  return (
    <nav aria-label="Catalog pages" className="flex items-center justify-center gap-1 mt-8">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        aria-label="Previous page"
        className="flex items-center justify-center w-8 h-8 rounded-sm text-ink-500 hover:bg-ink-100 disabled:opacity-30 disabled:pointer-events-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-1"
      >
        <ChevronLeft size={15} />
      </button>

      {pageWindow(page, totalPages).map((p, i) =>
        p === 'ellipsis' ? (
          <span
            key={`ellipsis-${i}`}
            className="w-8 h-8 flex items-center justify-center text-ink-400"
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
              'w-8 h-8 rounded-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-1',
              p === page ? 'bg-green-700 text-white' : 'text-ink-600 hover:bg-ink-100'
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
        className="flex items-center justify-center w-8 h-8 rounded-sm text-ink-500 hover:bg-ink-100 disabled:opacity-30 disabled:pointer-events-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-1"
      >
        <ChevronRight size={15} />
      </button>
    </nav>
  )
}
