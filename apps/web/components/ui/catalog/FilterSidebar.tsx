// apps/web/components/ui/catalog/FilterSidebar.tsx

'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import {
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  CircleDot,
  FileText,
  MapPin,
  Tag,
  Hash,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BookStatus, BookFormat } from '@lasallia/types'

const useLayoutEffectSafe = typeof window !== 'undefined' ? useLayoutEffect : useEffect

// ─── Types ────────────────────────────────────────────────────────────────────

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
  /** 'sidebar' (default) keeps a persistent panel on desktop. 'drawer' always opens via the trigger button, even on desktop. */
  variant?: 'sidebar' | 'drawer'
}

// ─── Filter group definitions ─────────────────────────────────────────────────

type GroupDef = {
  id: string
  label: string
  icon: React.ReactNode
  isActive: (f: CatalogFilters) => boolean
}

const GROUP_DEFS: GroupDef[] = [
  {
    id: 'genre',
    label: 'Genre',
    icon: <BookOpen size={16} />,
    isActive: (f) => f.genre !== 'all',
  },
  {
    id: 'availability',
    label: 'Availability',
    icon: <CircleDot size={16} />,
    isActive: (f) => f.availability !== 'all',
  },
  {
    id: 'format',
    label: 'Format',
    icon: <FileText size={16} />,
    isActive: (f) => f.format !== 'all',
  },
  {
    id: 'floor',
    label: 'Floor Location',
    icon: <MapPin size={16} />,
    isActive: (f) => f.floor !== 'all',
  },
  {
    id: 'subject',
    label: 'Subject',
    icon: <Tag size={16} />,
    isActive: (f) => f.subject !== 'all',
  },
  {
    id: 'callno',
    label: 'Call No. Range',
    icon: <Hash size={16} />,
    isActive: (f) => f.call_number_start !== '' || f.call_number_end !== '',
  },
]

// ─── Collapsible filter section ───────────────────────────────────────────────

type FilterSectionProps = {
  id: string
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  highlighted?: boolean
  onHighlightDone?: () => void
}

function FilterSection({
  id,
  title,
  children,
  defaultOpen = true,
  highlighted = false,
  onHighlightDone,
}: FilterSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!highlighted) return
    setOpen(true)
    const frame = requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
    const timer = setTimeout(() => onHighlightDone?.(), 900)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [highlighted, onHighlightDone])

  return (
    <div
      ref={ref}
      id={`filter-section-${id}`}
      className={cn(
        'border-b border-ink-100 last:border-b-0 transition-colors duration-700',
        highlighted && 'bg-green-50/70'
      )}
    >
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
        <ChevronDown
          size={13}
          className={cn(
            'text-ink-400 shrink-0 transition-transform duration-300',
            open && 'rotate-180'
          )}
        />
      </button>
      <div
        className={cn(
          'grid transition-all duration-300 ease-in-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="overflow-hidden">
          <div className="pb-3 px-3">{children}</div>
        </div>
      </div>
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
        {checked && <span className="w-1.5 h-1.5 rounded-full bg-green-700" />}
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

// ─── Collapsed icon rail ──────────────────────────────────────────────────────

function CollapsedRail({
  filters,
  onExpand,
}: {
  filters: CatalogFilters
  onExpand: (groupId?: string) => void
}) {
  return (
    <div className="flex flex-col items-center py-2 gap-0.5">

      {/* Expand chevron */}
      <button
        type="button"
        onClick={() => onExpand()}
        aria-label="Expand filters panel"
        className="flex items-center justify-center w-9 h-9 rounded-(--radius-sm) text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-1"
      >
        <ChevronLeft size={15} />
      </button>

      {/* Divider */}
      <div className="w-6 border-t border-ink-200 my-1" />

      {/* One button per filter group */}
      {GROUP_DEFS.map((group) => {
        const active = group.isActive(filters)
        return (
          <button
            key={group.id}
            type="button"
            onClick={() => onExpand(group.id)}
            aria-label={`${group.label} filter${active ? ' (active)' : ''}`}
            aria-pressed={active}
            className={cn(
              'relative flex items-center justify-center w-9 h-9 rounded-(--radius-sm) transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-1',
              active
                ? 'text-green-700 bg-green-50 hover:bg-green-100'
                : 'text-ink-400 hover:bg-ink-100 hover:text-ink-700'
            )}
          >
            {group.icon}
            {active && (
              <span
                aria-hidden="true"
                className="absolute top-1 right-1 w-2 h-2 rounded-full bg-green-600 ring-1 ring-white"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

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
  variant = 'sidebar',
}: FilterSidebarProps) {
  const isDrawer = variant === 'drawer'
  const [collapsed, setCollapsed] = useState(false)
  const [highlightGroup, setHighlightGroup] = useState<string | null>(null)

  useLayoutEffectSafe(() => {
    if (localStorage.getItem('catalog-filter-collapsed') === 'true') setCollapsed(true)
  }, [])

  useEffect(() => {
    localStorage.setItem('catalog-filter-collapsed', String(collapsed))
  }, [collapsed])

  const handleExpand = useCallback((groupId?: string) => {
    setCollapsed(false)
    if (groupId) setHighlightGroup(groupId)
  }, [])

  const clearHighlight = useCallback(() => setHighlightGroup(null), [])

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

  const expandedContent = (
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
        <div className="flex items-center gap-2">
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
          {/* Desktop collapse-to-rail (sidebar variant only — the drawer variant closes fully instead) */}
          {!isDrawer && (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse filters panel"
              className="hidden lg:flex items-center justify-center w-6 h-6 rounded-sm text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-1"
            >
              <ChevronRight size={14} />
            </button>
          )}
          {/* Close (mobile always; desktop only in drawer variant, since the sidebar variant has no way to close) */}
          {onClose && (
            <button
              type="button"
              suppressHydrationWarning
              onClick={onClose}
              aria-label="Close filters"
              className={cn('flex items-center justify-center w-6 h-6 rounded-sm text-ink-400 hover:bg-ink-100 transition-colors', !isDrawer && 'lg:hidden')}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto">

        <FilterSection
          id="genre"
          title="Genre"
          highlighted={highlightGroup === 'genre'}
          onHighlightDone={clearHighlight}
        >
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

        <FilterSection
          id="availability"
          title="Availability"
          highlighted={highlightGroup === 'availability'}
          onHighlightDone={clearHighlight}
        >
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

        <FilterSection
          id="format"
          title="Format"
          defaultOpen={false}
          highlighted={highlightGroup === 'format'}
          onHighlightDone={clearHighlight}
        >
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

        <FilterSection
          id="floor"
          title="Floor Location"
          defaultOpen={false}
          highlighted={highlightGroup === 'floor'}
          onHighlightDone={clearHighlight}
        >
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

        <FilterSection
          id="subject"
          title="Subject"
          defaultOpen={false}
          highlighted={highlightGroup === 'subject'}
          onHighlightDone={clearHighlight}
        >
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

        <FilterSection
          id="callno"
          title="Call No. Range"
          defaultOpen={false}
          highlighted={highlightGroup === 'callno'}
          onHighlightDone={clearHighlight}
        >
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

  // Drawer variant: width animates between 0 and its normal size instead of mounting/unmounting,
  // so opening/closing on desktop slides smoothly rather than popping in and out. It has no
  // collapse-to-rail state — 'collapsed' only applies to the persistent sidebar variant.
  const desktopClosed = isDrawer && !isOpen
  const desktopCollapsedToRail = !isDrawer && collapsed
  const desktopWidth = desktopClosed ? 0 : (desktopCollapsedToRail ? 56 : 220)

  return (
    <>
      {/* Desktop sticky sidebar — always shown (sidebar variant), or slides open/closed via width (drawer variant) */}
      <aside
        className={cn(
          'hidden lg:flex flex-col bg-white border-l border-ink-200 shrink-0 overflow-hidden sticky top-0 self-start',
          'transition-[width,opacity] duration-300 ease-in-out',
          className
        )}
        style={{
          width: desktopWidth,
          height: 'calc(100vh - var(--height-nav))',
          opacity: desktopClosed ? 0 : 1,
        }}
        aria-hidden={desktopClosed}
        inert={desktopClosed ? true : undefined}
        aria-label="Filters panel"
      >
        {desktopCollapsedToRail
          ? <CollapsedRail filters={filters} onExpand={handleExpand} />
          : expandedContent
        }
      </aside>

      {/* Mobile backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-150 lg:hidden transition-opacity duration-300 ease-in-out',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        style={{ background: 'rgba(0,0,0,0.4)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Mobile drawer */}
      <aside
        className={cn(
          'fixed right-0 bottom-0 z-160 flex flex-col bg-white border-l border-ink-200',
          'transition-transform duration-300 ease-in-out lg:hidden w-72',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
        style={{ top: 'var(--height-nav)' }}
        aria-hidden={!isOpen}
        inert={!isOpen ? true : undefined}
        aria-label="Filters panel"
      >
        {expandedContent}
      </aside>
    </>
  )
}
