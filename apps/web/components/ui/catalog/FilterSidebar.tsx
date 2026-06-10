// apps/web/components/ui/catalog/FilterSidebar.tsx
// Sprint 3.1.2 — Filter sidebar (genre, availability, call number range, subject, format, floor)

'use client'

import { useState } from 'react'
import { X, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BookStatus, BookFormat } from '@lasallia/types'

export type CatalogFilters = {
  genre: string
  availability: BookStatus | 'all'
  call_number_start: string
  call_number_end: string
  subject: string
  format: BookFormat | 'all'
  floor: string
}

export const DEFAULT_FILTERS: CatalogFilters = {
  genre: 'all',
  availability: 'all',
  call_number_start: '',
  call_number_end: '',
  subject: 'all',
  format: 'all',
  floor: 'all',
}

type FilterSidebarProps = {
  filters: CatalogFilters
  onChange: (filters: CatalogFilters) => void
  genres: string[]
  subjects: string[]
  floors: string[]
  isOpen?: boolean
  onClose?: () => void
  className?: string
}

// ─── Collapsible section ──────────────────────────────────────────────────────
function FilterSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-ink-100 last:border-b-0">
      <button
        type="button"
        suppressHydrationWarning
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between py-3 px-4 hover:bg-ink-50 transition-colors"
      >
        <span
          className="text-ink-600 font-semibold uppercase tracking-wider"
          style={{
            fontSize: 'var(--text-2xs)',
            letterSpacing: 'var(--tracking-section)',
            fontFamily: 'var(--font-body)',
          }}
        >
          {title}
        </span>
        {open
          ? <ChevronUp size={13} className="text-ink-400 flex-shrink-0" />
          : <ChevronDown size={13} className="text-ink-400 flex-shrink-0" />}
      </button>
      {open && <div className="pb-3 px-3">{children}</div>}
    </div>
  )
}

// ─── Radio option ─────────────────────────────────────────────────────────────
function RadioOption({
  name,
  value,
  checked,
  label,
  onChange,
}: {
  name: string
  value: string
  checked: boolean
  label: string
  onChange: (v: string) => void
}) {
  return (
    <label
      className={cn(
        'flex items-center gap-2.5 cursor-pointer rounded-sm px-2 py-1.5 transition-colors select-none',
        checked ? 'bg-green-50' : 'hover:bg-ink-50'
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="sr-only"
      />
      <span
        className={cn(
          'flex-shrink-0 w-3.5 h-3.5 rounded-full border-2 transition-colors flex items-center justify-center',
          checked ? 'border-green-700 bg-white' : 'border-ink-400 bg-white'
        )}
      >
        {checked && (
          <span className="w-1.5 h-1.5 rounded-full bg-green-700" />
        )}
      </span>
      <span
        className={cn(
          'flex-1 leading-none',
          checked ? 'text-green-800 font-medium' : 'text-ink-600'
        )}
        style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
      >
        {label}
      </span>
    </label>
  )
}

// ─── Options ──────────────────────────────────────────────────────────────────
const AVAIL_OPTIONS: Array<{ value: BookStatus | 'all'; label: string }> = [
  { value: 'all',       label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'borrowed',  label: 'Borrowed' },
  { value: 'reserved',  label: 'Reserved' },
  { value: 'misplaced', label: 'Missing' },
]

const FORMAT_OPTIONS: Array<{ value: BookFormat | 'all'; label: string }> = [
  { value: 'all',       label: 'All Formats' },
  { value: 'print',     label: 'Print' },
  { value: 'digital',   label: 'Digital' },
  { value: 'reference', label: 'Reference' },
]

// ─── Main component ───────────────────────────────────────────────────────────
export function FilterSidebar({
  filters,
  onChange,
  genres,
  subjects,
  floors,
  isOpen,
  onClose,
  className,
}: FilterSidebarProps) {
  const set = <K extends keyof CatalogFilters>(key: K, value: CatalogFilters[K]) =>
    onChange({ ...filters, [key]: value })

  const hasActive =
    filters.genre !== 'all' ||
    filters.availability !== 'all' ||
    filters.format !== 'all' ||
    filters.floor !== 'all' ||
    filters.subject !== 'all' ||
    filters.call_number_start !== '' ||
    filters.call_number_end !== ''

  const genreOptions   = genres.map((g) => ({ value: g === 'All' ? 'all' : g, label: g }))
  const subjectOptions = subjects.map((s) => ({ value: s === 'All' ? 'all' : s, label: s }))
  const floorOptions   = floors.map((f) => ({ value: f === 'All' ? 'all' : f, label: f }))

  const content = (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-ink-200">
        <div className="flex items-center gap-2">
          <span
            className="text-ink-900 font-semibold"
            style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
          >
            Filters
          </span>
          {hasActive && (
            <span
              className="flex items-center justify-center rounded-full bg-green-700 text-white font-bold"
              style={{ width: 16, height: 16, fontSize: 9, fontFamily: 'var(--font-body)' }}
            >
              ✓
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {hasActive && (
            <button
              type="button"
              suppressHydrationWarning
              onClick={() => onChange(DEFAULT_FILTERS)}
              className="text-green-700 font-medium hover:text-green-900 transition-colors underline underline-offset-2"
              style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}
            >
              Clear all
            </button>
          )}
          {onClose && (
            <button
              type="button"
              suppressHydrationWarning
              onClick={onClose}
              className="lg:hidden flex items-center justify-center w-6 h-6 rounded-sm text-ink-400 hover:bg-ink-100 transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto">

        <FilterSection title="Genre">
          <div className="flex flex-col gap-0.5">
            {genreOptions.map((opt) => (
              <RadioOption
                key={opt.value}
                name="genre"
                value={opt.value}
                checked={filters.genre === opt.value}
                label={opt.label}
                onChange={(v) => set('genre', v)}
              />
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Availability">
          <div className="flex flex-col gap-0.5">
            {AVAIL_OPTIONS.map((opt) => (
              <RadioOption
                key={opt.value}
                name="availability"
                value={opt.value}
                checked={filters.availability === opt.value}
                label={opt.label}
                onChange={(v) => set('availability', v as BookStatus | 'all')}
              />
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Format" defaultOpen={false}>
          <div className="flex flex-col gap-0.5">
            {FORMAT_OPTIONS.map((opt) => (
              <RadioOption
                key={opt.value}
                name="format"
                value={opt.value}
                checked={filters.format === opt.value}
                label={opt.label}
                onChange={(v) => set('format', v as BookFormat | 'all')}
              />
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Floor Location" defaultOpen={false}>
          <div className="flex flex-col gap-0.5">
            {floorOptions.map((opt) => (
              <RadioOption
                key={opt.value}
                name="floor"
                value={opt.value}
                checked={filters.floor === opt.value}
                label={opt.label}
                onChange={(v) => set('floor', v)}
              />
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Subject" defaultOpen={false}>
          <div className="flex flex-col gap-0.5">
            {subjectOptions.map((opt) => (
              <RadioOption
                key={opt.value}
                name="subject"
                value={opt.value}
                checked={filters.subject === opt.value}
                label={opt.label}
                onChange={(v) => set('subject', v)}
              />
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Call No. Range" defaultOpen={false}>
          <div className="flex flex-col gap-2">
            <div>
              <label
                className="block text-ink-400 mb-1"
                style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}
              >
                From
              </label>
              <input
                type="text"
                value={filters.call_number_start}
                onChange={(e) => set('call_number_start', e.target.value)}
                placeholder="e.g. 000"
                className="w-full px-2.5 py-1.5 rounded-sm border border-ink-200 bg-white text-ink-900 placeholder:text-ink-300 focus:outline-none focus:border-green-700 transition-colors"
                style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-mono)' }}
              />
            </div>
            <div>
              <label
                className="block text-ink-400 mb-1"
                style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}
              >
                To
              </label>
              <input
                type="text"
                value={filters.call_number_end}
                onChange={(e) => set('call_number_end', e.target.value)}
                placeholder="e.g. 999"
                className="w-full px-2.5 py-1.5 rounded-sm border border-ink-200 bg-white text-ink-900 placeholder:text-ink-300 focus:outline-none focus:border-green-700 transition-colors"
                style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-mono)' }}
              />
            </div>
          </div>
        </FilterSection>

      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sticky sidebar */}
      <aside
        className={cn(
          'hidden lg:flex flex-col bg-white border-r border-ink-200 flex-shrink-0 overflow-hidden sticky top-0 self-start',
          className
        )}
        style={{ width: 220, height: 'calc(100vh - var(--height-nav))' }}
      >
        {content}
      </aside>

      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-150 lg:hidden"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={onClose}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          'fixed left-0 bottom-0 z-160 flex flex-col bg-white border-r border-ink-200',
          'transition-transform duration-300 lg:hidden w-72',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ top: 'var(--height-nav)' }}
      >
        {content}
      </aside>
    </>
  )
}