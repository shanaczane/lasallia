// apps/web/app/student/catalog/page.tsx
// Sprint 4.3.1 — Authenticated student catalog (same as Guest + bookmark buttons)
// Responsive filters: desktop sidebar / mobile bottom sheet (sprint: responsive catalog filters)

'use client'

import { Suspense, useMemo, useRef, useState } from 'react'
import { Search, ArrowUpDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Book } from '@lasallia/types'
import {
  FilterSheet,
  FilterPillBar,
  QuickChipRow,
  AppliedChips,
  BookGrid,
  buildFilterSections,
  filterBooksByCatalogFilters,
  useCatalogFilters,
} from '@/components/ui/catalog'
import {
  MOCK_BOOKS,
  MOCK_CATEGORIES,
  MOCK_SUBJECTS,
  MOCK_FLOORS,
  CATALOG_STATS,
} from '@/lib/mock/catalog'

type SortOption = 'relevance' | 'title_asc' | 'title_desc' | 'year_desc' | 'year_asc'

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: 'relevance',  label: 'Most relevant' },
  { value: 'title_asc',  label: 'Title A–Z' },
  { value: 'title_desc', label: 'Title Z–A' },
  { value: 'year_desc',  label: 'Newest first' },
  { value: 'year_asc',   label: 'Oldest first' },
]

function sortBooks(books: Book[], sort: SortOption): Book[] {
  const s = [...books]
  switch (sort) {
    case 'title_asc':  return s.sort((a, b) => a.title.localeCompare(b.title))
    case 'title_desc': return s.sort((a, b) => b.title.localeCompare(a.title))
    case 'year_desc':  return s.sort((a, b) => (b.published_year ?? 0) - (a.published_year ?? 0))
    case 'year_asc':   return s.sort((a, b) => (a.published_year ?? 0) - (b.published_year ?? 0))
    default:           return s
  }
}

function searchBooks(books: Book[], query: string): Book[] {
  if (!query.trim()) return books
  const q = query.toLowerCase()
  return books.filter(
    (book) =>
      book.title.toLowerCase().includes(q) ||
      book.author.toLowerCase().includes(q) ||
      book.category.toLowerCase().includes(q) ||
      (book.subject?.toLowerCase().includes(q) ?? false) ||
      book.call_number.toLowerCase().includes(q)
  )
}

function StudentCatalogContent() {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortOption>('relevance')
  const [sheetOpen, setSheetOpen] = useState(false)
  const filtersButtonRef = useRef<HTMLButtonElement>(null)

  const { filters, setFilter, setFilters, resetSection, resetAll, activeCount, hasActive } = useCatalogFilters()

  const sections = useMemo(
    () => buildFilterSections({ genres: MOCK_CATEGORIES, subjects: MOCK_SUBJECTS, floors: MOCK_FLOORS }),
    []
  )

  const results = useMemo(
    () => sortBooks(filterBooksByCatalogFilters(searchBooks(MOCK_BOOKS, query), filters), sort),
    [query, filters, sort]
  )

  function clearAll() {
    setQuery('')
    resetAll()
  }

  return (
    <div className="flex" style={{ minHeight: 'calc(100vh - var(--height-nav))' }}>

      <div className="flex-1 min-w-0 px-5 sm:px-8 py-7">

        {/* Header */}
        <div className="mb-5">
          <h1
            className="text-ink-900 font-semibold leading-tight mb-0.5"
            style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-4xl)' }}
          >
            Search the{' '}
            <span className="text-green-600 italic">collection</span>
          </h1>
          <p
            className="text-ink-400"
            style={{ fontSize: 'var(--text-body)', fontFamily: 'var(--font-body)' }}
          >
            {CATALOG_STATS.total.toLocaleString()} titles indexed · live availability
          </p>
        </div>

        {/* Search + Sort + filter pills — sticky so they stay in view while scrolling, header stays put */}
        <div
          className="sticky z-40 bg-paper/95 backdrop-blur-sm border-b border-ink-100 py-3 -mt-3 flex flex-col gap-3 mb-5"
          style={{ top: 'var(--height-nav)' }}
        >
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 relative">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title, author, subject…"
                className={cn(
                  'w-full pl-9 pr-8 py-2 rounded-sm border bg-white text-ink-900',
                  'placeholder:text-ink-300 focus:outline-none transition-colors',
                  'border-ink-200 focus:border-green-700 hover:border-ink-300'
                )}
                style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
              />
              {query && (
                <button
                  type="button"
                  suppressHydrationWarning
                  onClick={() => setQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700 transition-colors"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <ArrowUpDown size={13} className="text-ink-400 hidden sm:block" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                className={cn(
                  'bg-white border border-ink-200 text-ink-700 rounded-sm px-2.5 py-2',
                  'focus:outline-none focus:border-green-700 cursor-pointer',
                  'hover:border-ink-300 transition-colors appearance-none pr-7'
                )}
                style={{
                  fontSize: 'var(--text-sm-body)',
                  fontFamily: 'var(--font-body)',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%238E9189' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 7px center',
                }}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <FilterPillBar
            filters={filters}
            onChange={setFilters}
            genres={MOCK_CATEGORIES}
            floors={MOCK_FLOORS}
            subjects={MOCK_SUBJECTS}
          />
        </div>

        {/* Applied filter chips */}
        <AppliedChips filters={filters} sections={sections} resetSection={resetSection} resetAll={resetAll} />

        {/* Result count */}
        <div className="flex items-center justify-between mb-3">
          <p
            className="text-ink-500"
            style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
          >
            {query || hasActive ? (
              <>
                <span className="font-semibold text-ink-900">{results.length}</span>{' '}
                {results.length === 1 ? 'result' : 'results'}
                {query && <> for &ldquo;<span className="text-ink-700">{query}</span>&rdquo;</>}
              </>
            ) : (
              <>Showing all <span className="font-semibold text-ink-900">{results.length}</span> titles</>
            )}
          </p>
        </div>

        {/* Mobile quick-chip row (above results grid) */}
        <QuickChipRow
          filters={filters}
          activeCount={activeCount}
          onOpenSheet={() => setSheetOpen(true)}
          setFilter={setFilter}
          filtersButtonRef={filtersButtonRef}
        />

        {/* Grid — showBookmark enables save-to-favorites on each card */}
        <BookGrid
          books={results}
          hrefPrefix="/student/catalog"
          showBookmark={true}
          hasActiveFilters={hasActive || !!query}
          onClearFilters={clearAll}
        />
      </div>

      <FilterSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        sections={sections}
        filters={filters}
        setFilter={setFilter}
        resetAll={resetAll}
        resultCount={results.length}
        triggerRef={filtersButtonRef}
      />
    </div>
  )
}

export default function StudentCatalogPage() {
  return (
    <Suspense fallback={null}>
      <StudentCatalogContent />
    </Suspense>
  )
}
