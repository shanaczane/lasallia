// apps/web/components/ui/catalog/FilterSidebar.tsx
// Desktop persistent filter sidebar (lg and up only). Mobile filtering lives in FilterSheet.

'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  CircleDot,
  FileText,
  MapPin,
  Tag,
  Hash,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BookStatus, BookFormat } from '@lasallia/types'
import {
  CatalogFilters,
  DEFAULT_FILTERS,
  FilterSectionConfig,
  RadioFilterKey,
  isSectionActive,
} from './filterConfig'

export type { CatalogFilters } from './filterConfig'
export { DEFAULT_FILTERS } from './filterConfig'

const useLayoutEffectSafe = typeof window !== 'undefined' ? useLayoutEffect : useEffect

const SECTION_ICONS: Record<FilterSectionConfig['key'], React.ReactNode> = {
  genre: <BookOpen size={16} />,
  availability: <CircleDot size={16} />,
  format: <FileText size={16} />,
  floor: <MapPin size={16} />,
  subject: <Tag size={16} />,
  callNo: <Hash size={16} />,
}

const DEFAULT_OPEN: Partial<Record<FilterSectionConfig['key'], boolean>> = {
  genre: true,
  availability: true,
}

type FilterSidebarProps = {
  filters: CatalogFilters
  setFilter: <K extends keyof CatalogFilters>(key: K, value: CatalogFilters[K]) => void
  resetAll: () => void
  sections: FilterSectionConfig[]
  className?: string
  /** 'sidebar' (default) keeps a persistent panel on desktop. 'drawer' always opens via the trigger button, even on desktop. */
  variant?: 'sidebar' | 'drawer'
  /** Controls the mobile slide-in drawer (and the desktop panel when variant='drawer'). */
  isOpen?: boolean
  onClose?: () => void
}

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
          'shrink-0 w-3.5 h-3.5 rounded-full border-2 transition-colors flex items-center justify-center',
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

export const AVAIL_OPTIONS: Array<{ value: BookStatus | 'all'; label: string }> = [
  { value: 'all',       label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'borrowed',  label: 'Borrowed' },
  { value: 'reserved',  label: 'Reserved' },
  { value: 'misplaced', label: 'Missing' },
]

export const FORMAT_OPTIONS: Array<{ value: BookFormat | 'all'; label: string }> = [
  { value: 'all',       label: 'All Formats' },
  { value: 'print',     label: 'Print' },
  { value: 'digital',   label: 'Digital' },
  { value: 'reference', label: 'Reference' },
]

// ─── Collapsed icon rail ──────────────────────────────────────────────────────

function CollapsedRail({
  sections,
  filters,
  onExpand,
}: {
  sections: FilterSectionConfig[]
  filters: CatalogFilters
  onExpand: (sectionKey?: string) => void
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

      {/* One button per filter section */}
      {sections.map((section) => {
        const active = isSectionActive(section, filters)
        return (
          <button
            key={section.key}
            type="button"
            onClick={() => onExpand(section.key)}
            aria-label={`${section.label} filter${active ? ' (active)' : ''}`}
            aria-pressed={active}
            className={cn(
              'relative flex items-center justify-center w-9 h-9 rounded-(--radius-sm) transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-1',
              active
                ? 'text-green-700 bg-green-50 hover:bg-green-100'
                : 'text-ink-400 hover:bg-ink-100 hover:text-ink-700'
            )}
          >
            {SECTION_ICONS[section.key]}
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
  setFilter,
  resetAll,
  sections,
  className,
  variant = 'sidebar',
  isOpen,
  onClose,
}: FilterSidebarProps) {
  const isDrawer = variant === 'drawer'
  const [collapsed, setCollapsed] = useState(false)
  const [highlightSection, setHighlightSection] = useState<string | null>(null)

  useLayoutEffectSafe(() => {
    if (localStorage.getItem('catalog-filter-collapsed') === 'true') setCollapsed(true)
  }, [])

  useEffect(() => {
    localStorage.setItem('catalog-filter-collapsed', String(collapsed))
  }, [collapsed])

  const handleExpand = useCallback((sectionKey?: string) => {
    setCollapsed(false)
    if (sectionKey) setHighlightSection(sectionKey)
  }, [])

  const clearHighlight = useCallback(() => setHighlightSection(null), [])

  const hasActive = sections.some((s) => isSectionActive(s, filters))

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
              onClick={resetAll}
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
        {sections.map((section) => (
          <FilterSection
            key={section.key}
            id={section.key}
            title={section.label}
            defaultOpen={DEFAULT_OPEN[section.key] ?? false}
            highlighted={highlightSection === section.key}
            onHighlightDone={clearHighlight}
          >
            {section.type === 'radio' ? (
              <div className="flex flex-col gap-0.5">
                {section.options.map((opt) => (
                  <RadioOption
                    key={opt.value}
                    name={section.key}
                    value={opt.value}
                    checked={filters[section.key as RadioFilterKey] === opt.value}
                    label={opt.label}
                    onChange={(v) => setFilter(section.key as RadioFilterKey, v as never)}
                  />
                ))}
              </div>
            ) : (
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
                    onChange={(e) => setFilter('call_number_start', e.target.value)}
                    placeholder="e.g. QA76"
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
                    onChange={(e) => setFilter('call_number_end', e.target.value)}
                    placeholder="e.g. QA99"
                    className="w-full px-2.5 py-1.5 rounded-sm border border-ink-200 bg-white text-ink-900 placeholder:text-ink-300 focus:outline-none focus:border-green-700 transition-colors"
                    style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-mono)' }}
                  />
                </div>
              </div>
            )}
          </FilterSection>
        ))}
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
          ? <CollapsedRail sections={sections} filters={filters} onExpand={handleExpand} />
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
