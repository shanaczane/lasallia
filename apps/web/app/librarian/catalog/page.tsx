// apps/web/app/librarian/catalog/page.tsx
// Fix: responsive layout, bigger cover card, stat bar wraps cleanly on mobile
// Responsive filters: desktop sidebar / mobile bottom sheet (sprint: responsive catalog filters)

'use client'

import { Suspense, useMemo, useRef, useState } from 'react'
import {
  Plus, Search, X, ArrowUpDown,
  BookMarked, CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Book } from '@lasallia/types'
import {
  MOCK_BOOKS,
  MOCK_CATEGORIES,
  MOCK_SUBJECTS,
  MOCK_FLOORS,
} from '@/lib/mock/catalog'
import {
  FilterSidebar,
  FilterSheet,
  QuickChipRow,
  AppliedChips,
  buildFilterSections,
  filterBooksByCatalogFilters,
  useCatalogFilters,
} from '@/components/ui/catalog'
import { LibrarianBookCard } from '@/components/ui/catalog/LibrarianBookCard'
import { BookFormModal, type BookFormData } from '@/components/ui/catalog/BookFormModal'
import { DeleteBookModal } from '@/components/ui/catalog/DeleteBookModal'

// ─── Sort ─────────────────────────────────────────────────────────────────────

type SortOption =
  | 'relevance'
  | 'title_asc'
  | 'title_desc'
  | 'year_desc'
  | 'year_asc'
  | 'copies_desc'
  | 'copies_asc'

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: 'relevance',    label: 'Most relevant' },
  { value: 'title_asc',   label: 'Title A–Z' },
  { value: 'title_desc',  label: 'Title Z–A' },
  { value: 'year_desc',   label: 'Newest first' },
  { value: 'year_asc',    label: 'Oldest first' },
  { value: 'copies_desc', label: 'Most copies' },
  { value: 'copies_asc',  label: 'Fewest copies' },
]

function sortBooks(books: Book[], sort: SortOption): Book[] {
  const s = [...books]
  switch (sort) {
    case 'title_asc':    return s.sort((a, b) => a.title.localeCompare(b.title))
    case 'title_desc':   return s.sort((a, b) => b.title.localeCompare(a.title))
    case 'year_desc':    return s.sort((a, b) => (b.published_year ?? 0) - (a.published_year ?? 0))
    case 'year_asc':     return s.sort((a, b) => (a.published_year ?? 0) - (b.published_year ?? 0))
    case 'copies_desc':  return s.sort((a, b) => (b.total_copies ?? 0) - (a.total_copies ?? 0))
    case 'copies_asc':   return s.sort((a, b) => (a.total_copies ?? 0) - (b.total_copies ?? 0))
    default:             return s
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
      book.call_number.toLowerCase().includes(q) ||
      (book.isbn?.includes(q) ?? false)
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-2 px-4 py-2.5 bg-ink-900 text-white rounded-full shadow-(--shadow-lg) pointer-events-none max-w-[90vw]">
      <CheckCircle2 size={15} className="text-green-400 shrink-0" />
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}>
        {message}
      </span>
    </div>
  )
}

// ─── Stat bar ─────────────────────────────────────────────────────────────────

function CatalogStats({ books }: { books: Book[] }) {
  const total    = books.reduce((sum, b) => sum + (b.total_copies ?? 0), 0)
  const avail    = books.reduce((sum, b) => sum + (b.available_copies ?? 0), 0)
  const borrowed = total - avail

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
      {[
        { label: 'Titles',       value: books.length },
        { label: 'Total copies', value: total },
        { label: 'Available',    value: avail },
        { label: 'Checked out',  value: borrowed },
      ].map(({ label, value }) => (
        <div
          key={label}
          className="flex flex-col items-start px-5 py-4 bg-white border border-ink-200 rounded-(--radius-sm)"
        >
          <span
            className="text-ink-900 font-bold tabular-nums leading-none"
            style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-4xl)' }}
          >
            {value.toLocaleString()}
          </span>
          <span
            className="text-ink-400 mt-1.5"
            style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function LibrarianCatalogContent() {
  const [books, setBooks]       = useState<Book[]>(MOCK_BOOKS)
  const [query, setQuery]       = useState('')
  const [sort, setSort]         = useState<SortOption>('relevance')
  const [sheetOpen, setSheetOpen] = useState(false)
  const filtersButtonRef = useRef<HTMLButtonElement>(null)

  const [addOpen,    setAddOpen]    = useState(false)
  const [editBook,   setEditBook]   = useState<Book | null>(null)
  const [deleteBook, setDeleteBook] = useState<Book | null>(null)

  const [toast, setToast] = useState<string | null>(null)

  const { filters, setFilter, resetSection, resetAll, activeCount, hasActive } = useCatalogFilters()

  const sections = useMemo(
    () => buildFilterSections({ genres: MOCK_CATEGORIES, subjects: MOCK_SUBJECTS, floors: MOCK_FLOORS }),
    []
  )

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const results = useMemo(
    () => sortBooks(filterBooksByCatalogFilters(searchBooks(books, query), filters), sort),
    [books, query, filters, sort]
  )

  function clearAll() {
    setQuery('')
    resetAll()
  }

  // ── Handlers ──

  function handleAddSubmit(data: BookFormData) {
    const newBook: Book = {
      id:               `new-${Date.now()}`,
      title:            data.title.trim(),
      author:           data.author.trim(),
      isbn:             data.isbn.trim() || undefined,
      publisher:        data.publisher.trim() || undefined,
      published_year:   data.published_year ? parseInt(data.published_year, 10) : undefined,
      call_number:      data.call_number.trim(),
      floor:            data.floor,
      aisle:            data.aisle.trim(),
      shelf_location:   `${data.floor} · ${data.aisle.trim()}`,
      total_copies:     parseInt(data.total_copies, 10),
      available_copies: parseInt(data.total_copies, 10),
      category:         data.category.trim() || 'Uncategorised',
      subject:          data.subject.trim() || undefined,
      format:           data.format || undefined,
      abstract:         data.abstract.trim() || undefined,
      status:           'available',
      created_at:       new Date().toISOString(),
      updated_at:       new Date().toISOString(),
    }
    setBooks((prev) => [newBook, ...prev])
    setAddOpen(false)
    showToast(`"${newBook.title}" added to the catalog.`)
  }

  function handleEditSubmit(data: BookFormData) {
    if (!editBook) return
    setBooks((prev) =>
      prev.map((b) =>
        b.id === editBook.id
          ? {
              ...b,
              title:          data.title.trim(),
              author:         data.author.trim(),
              isbn:           data.isbn.trim() || undefined,
              publisher:      data.publisher.trim() || undefined,
              published_year: data.published_year ? parseInt(data.published_year, 10) : undefined,
              call_number:    data.call_number.trim(),
              floor:          data.floor,
              aisle:          data.aisle.trim(),
              shelf_location: `${data.floor} · ${data.aisle.trim()}`,
              total_copies:   parseInt(data.total_copies, 10),
              category:       data.category.trim() || b.category,
              subject:        data.subject.trim() || undefined,
              format:         data.format || undefined,
              abstract:       data.abstract.trim() || undefined,
              updated_at:     new Date().toISOString(),
            }
          : b
      )
    )
    setEditBook(null)
    showToast(`"${data.title.trim()}" updated.`)
  }

  function handleArchive(book: Book) {
    setBooks((prev) => prev.filter((b) => b.id !== book.id))
    showToast(`"${book.title}" archived.`)
  }

  function handleDelete(book: Book) {
    setBooks((prev) => prev.filter((b) => b.id !== book.id))
    showToast(`"${book.title}" permanently deleted.`)
  }

  // ── Render ──

  return (
    <div className="flex" style={{ minHeight: 'calc(100vh - var(--height-nav))' }}>

      {/* Filter sidebar (desktop only) */}
      <FilterSidebar filters={filters} setFilter={setFilter} resetAll={resetAll} sections={sections} />

      {/* Main */}
      <div className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6">

        {/* Page header */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h1
              className="text-ink-900 leading-tight mb-0.5"
              style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-4xl)' }}
            >
              Book <span className="text-green-600 italic">Catalog</span>
            </h1>
            <p
              className="text-ink-400"
              style={{ fontSize: 'var(--text-body)', fontFamily: 'var(--font-body)' }}
            >
              Manage titles, copies, and acquisition data
            </p>
          </div>

          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-(--radius-sm) bg-green-700 text-white font-semibold hover:bg-green-800 active:bg-green-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-1 shrink-0"
            style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
          >
            <Plus size={16} />
            Add New Book
          </button>
        </div>

        {/* Stats */}
        <CatalogStats books={books} />

        {/* Search + sort + mobile filter toggle */}
        <div className="flex items-center gap-2 mb-3">
          {/* Search */}
          <div className="flex-1 relative min-w-0">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, author, ISBN, call no…"
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
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700 transition-colors"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Sort — hide label on mobile */}
          <div className="shrink-0 hidden sm:flex items-center gap-1.5">
            <ArrowUpDown size={13} className="text-ink-400" />
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

        {/* Mobile sort — shown only on mobile */}
        <div className="flex sm:hidden items-center gap-2 mb-3">
          <ArrowUpDown size={13} className="text-ink-400 shrink-0" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="flex-1 bg-white border border-ink-200 text-ink-700 rounded-sm px-2.5 py-2 focus:outline-none focus:border-green-700 cursor-pointer hover:border-ink-300 transition-colors appearance-none"
            style={{
              fontSize: 'var(--text-sm-body)',
              fontFamily: 'var(--font-body)',
            }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Applied filter chips */}
        <AppliedChips filters={filters} sections={sections} resetSection={resetSection} resetAll={resetAll} />

        {/* Result count */}
        <p
          className="text-ink-500 mb-3"
          style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
        >
          {query || hasActive ? (
            <>
              <span className="font-semibold text-ink-900">{results.length}</span>{' '}
              {results.length === 1 ? 'result' : 'results'}
              {query && (
                <> for &ldquo;<span className="text-ink-700">{query}</span>&rdquo;</>
              )}
            </>
          ) : (
            <>
              Showing all{' '}
              <span className="font-semibold text-ink-900">{results.length}</span> titles
            </>
          )}
        </p>

        {/* Mobile quick-chip row (above results list) */}
        <QuickChipRow
          filters={filters}
          activeCount={activeCount}
          onOpenSheet={() => setSheetOpen(true)}
          setFilter={setFilter}
          filtersButtonRef={filtersButtonRef}
        />

        {/* Book list */}
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-ink-100 mb-4">
              <BookMarked size={28} className="text-ink-300" />
            </div>
            <p
              className="text-ink-700 font-semibold mb-1"
              style={{ fontSize: 'var(--text-lg)', fontFamily: 'var(--font-display)' }}
            >
              {hasActive || query ? 'No titles match these filters' : 'No books found'}
            </p>
            <p
              className="text-ink-400 max-w-xs mb-4"
              style={{ fontSize: 'var(--text-body)', fontFamily: 'var(--font-body)' }}
            >
              Try adjusting your search or filters, or add a new book.
            </p>
            {(hasActive || query) && (
              <button
                type="button"
                onClick={clearAll}
                className="text-green-700 font-semibold hover:text-green-900 underline underline-offset-2 transition-colors"
                style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {results.map((book) => (
              <LibrarianBookCard
                key={book.id}
                book={book}
                onEdit={(b) => setEditBook(b)}
                onDelete={(b) => setDeleteBook(b)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <BookFormModal
        mode="add"
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={handleAddSubmit}
      />
      <BookFormModal
        mode="edit"
        book={editBook ?? undefined}
        isOpen={editBook !== null}
        onClose={() => setEditBook(null)}
        onSubmit={handleEditSubmit}
      />
      <DeleteBookModal
        book={deleteBook}
        isOpen={deleteBook !== null}
        onClose={() => setDeleteBook(null)}
        onArchive={handleArchive}
        onDelete={handleDelete}
      />

      {toast && <Toast message={toast} />}

      {/* Mobile filter bottom sheet */}
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

export default function LibrarianCatalogPage() {
  return (
    <Suspense fallback={null}>
      <LibrarianCatalogContent />
    </Suspense>
  )
}