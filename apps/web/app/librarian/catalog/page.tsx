// apps/web/app/librarian/catalog/page.tsx
// Fix: responsive layout, bigger cover card, stat bar wraps cleanly on mobile

'use client'

import { useState, useMemo } from 'react'
import {
  Plus, Search, X, SlidersHorizontal, ArrowUpDown,
  BookMarked, Copy, CheckCircle2, ArrowRightLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Book } from '@lasallia/types'
import {
  MOCK_BOOKS,
  MOCK_CATEGORIES,
  MOCK_SUBJECTS,
  MOCK_FLOORS,
} from '@/lib/mock/catalog'
import { FilterSidebar, CatalogFilters, DEFAULT_FILTERS } from '@/components/ui/catalog'
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

function filterBooks(books: Book[], query: string, filters: CatalogFilters): Book[] {
  return books.filter((book) => {
    if (query.trim()) {
      const q = query.toLowerCase()
      const hit =
        book.title.toLowerCase().includes(q) ||
        book.author.toLowerCase().includes(q) ||
        book.category.toLowerCase().includes(q) ||
        (book.subject?.toLowerCase().includes(q) ?? false) ||
        book.call_number.toLowerCase().includes(q) ||
        (book.isbn?.includes(q) ?? false)
      if (!hit) return false
    }
    if (filters.genre !== 'all' && book.category !== filters.genre) return false
    if (filters.availability !== 'all') {
      const match =
        filters.availability === 'misplaced'
          ? book.status === 'misplaced'
          : book.status === filters.availability
      if (!match) return false
    }
    if (filters.subject !== 'all' && book.subject !== filters.subject) return false
    if (filters.format !== 'all' && book.format !== filters.format) return false
    if (filters.floor !== 'all' && book.floor !== filters.floor) return false
    if (filters.call_number_start && book.call_number < filters.call_number_start) return false
    if (filters.call_number_end   && book.call_number > filters.call_number_end)   return false
    return true
  })
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

  const stats = [
    { icon: <BookMarked size={18} className="text-green-700" />, iconBg: 'bg-green-100', label: 'Titles',       value: books.length },
    { icon: <Copy size={18} className="text-info" />,            iconBg: 'bg-info-bg',    label: 'Total Copies', value: total },
    { icon: <CheckCircle2 size={18} className="text-success" />, iconBg: 'bg-success-bg', label: 'Available',    value: avail },
    { icon: <ArrowRightLeft size={18} className="text-warn" />,  iconBg: 'bg-warn-bg',    label: 'Checked Out',  value: borrowed },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
      {stats.map(({ icon, iconBg, label, value }) => (
        <div
          key={label}
          className="min-w-0 bg-white rounded-(--radius) border border-ink-200 p-3 sm:p-4 flex flex-col gap-2 sm:gap-3"
        >
          <div className={cn('flex items-center justify-center rounded-sm w-7 h-7 sm:w-9 sm:h-9', iconBg)}>
            {icon}
          </div>
          <div>
            <p
              className="text-ink-400 uppercase font-semibold truncate"
              style={{ fontSize: 'var(--text-2xs)', letterSpacing: 'var(--tracking-caps)', fontFamily: 'var(--font-body)' }}
            >
              {label}
            </p>
            <p
              className="text-ink-900 font-bold leading-tight tabular-nums"
              style={{ fontSize: 'var(--text-2xl)', fontFamily: 'var(--font-display)' }}
            >
              {value.toLocaleString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Active filter tag ────────────────────────────────────────────────────────

function FilterTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 rounded-full bg-green-100 text-green-800 font-medium capitalize">
      <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="flex items-center justify-center w-4 h-4 rounded-full text-green-600 hover:text-green-900 hover:bg-green-200 transition-colors"
      >
        <X size={10} />
      </button>
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LibrarianCatalogPage() {
  const [books, setBooks]       = useState<Book[]>(MOCK_BOOKS)
  const [query, setQuery]       = useState('')
  const [filters, setFilters]   = useState<CatalogFilters>(DEFAULT_FILTERS)
  const [sort, setSort]         = useState<SortOption>('relevance')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const [addOpen,    setAddOpen]    = useState(false)
  const [editBook,   setEditBook]   = useState<Book | null>(null)
  const [deleteBook, setDeleteBook] = useState<Book | null>(null)

  const [toast, setToast] = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const results = useMemo(
    () => sortBooks(filterBooks(books, query, filters), sort),
    [books, query, filters, sort]
  )

  const activeFilters = [
    filters.genre        !== 'all' && { key: 'genre',        label: filters.genre,        clear: () => setFilters((f) => ({ ...f, genre: 'all' })) },
    filters.availability !== 'all' && { key: 'availability', label: filters.availability, clear: () => setFilters((f) => ({ ...f, availability: 'all' })) },
    filters.format       !== 'all' && { key: 'format',       label: filters.format,       clear: () => setFilters((f) => ({ ...f, format: 'all' })) },
    filters.floor        !== 'all' && { key: 'floor',        label: filters.floor,        clear: () => setFilters((f) => ({ ...f, floor: 'all' })) },
    filters.subject      !== 'all' && { key: 'subject',      label: filters.subject,      clear: () => setFilters((f) => ({ ...f, subject: 'all' })) },
  ].filter(Boolean) as Array<{ key: string; label: string; clear: () => void }>

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

          {/* Mobile filter toggle */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className={cn(
              'lg:hidden flex items-center gap-1.5 px-3 py-2 rounded-sm border font-medium transition-colors shrink-0',
              activeFilters.length > 0
                ? 'border-green-700 bg-green-50 text-green-800'
                : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300'
            )}
            style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
          >
            <SlidersHorizontal size={14} />
            <span className="hidden xs:inline">Filters</span>
            {activeFilters.length > 0 && (
              <span
                className="flex items-center justify-center rounded-full bg-green-700 text-white font-bold"
                style={{ width: 16, height: 16, fontSize: 9 }}
              >
                {activeFilters.length}
              </span>
            )}
          </button>
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

        {/* Active filter tags */}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span
              className="text-ink-400"
              style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}
            >
              Active:
            </span>
            {activeFilters.map(({ key, label, clear }) => (
              <FilterTag key={key} label={label} onRemove={clear} />
            ))}
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="text-green-700 font-medium hover:text-green-900 underline underline-offset-2 transition-colors"
              style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}
            >
              Clear all
            </button>
          </div>
        )}

        {/* Result count */}
        <p
          className="text-ink-500 mb-4"
          style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
        >
          {query || activeFilters.length > 0 ? (
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
              No books found
            </p>
            <p
              className="text-ink-400 max-w-xs"
              style={{ fontSize: 'var(--text-body)', fontFamily: 'var(--font-body)' }}
            >
              Try adjusting your search or filters, or add a new book.
            </p>
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

      {/* Filter sidebar */}
      <FilterSidebar
        filters={filters}
        onChange={setFilters}
        genres={MOCK_CATEGORIES}
        subjects={MOCK_SUBJECTS}
        floors={MOCK_FLOORS}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

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
    </div>
  )
}