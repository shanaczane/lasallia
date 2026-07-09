// apps/web/components/ui/catalog/FilterSheet.tsx
// Mobile filter panel — slides up from the bottom. Renders from the same
// FILTER_SECTIONS config + filter state as FilterSidebar (single source of truth).

'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CatalogFilters,
  FilterSectionConfig,
  isSectionActive,
  labelForValue,
  callNoSummary,
} from './filterConfig'

type FilterSheetProps = {
  isOpen: boolean
  onClose: () => void
  sections: FilterSectionConfig[]
  filters: CatalogFilters
  setFilter: <K extends keyof CatalogFilters>(key: K, value: CatalogFilters[K]) => void
  resetAll: () => void
  resultCount: number
  triggerRef?: React.RefObject<HTMLElement | null>
}

const OPTION_TRUNCATE = 6

function sectionSummary(section: FilterSectionConfig, filters: CatalogFilters): { text: string; active: boolean } {
  const active = isSectionActive(section, filters)
  if (section.type === 'range') return { text: callNoSummary(filters), active }
  return { text: active ? labelForValue(section, filters[section.key]) : 'All', active }
}

export function FilterSheet({
  isOpen,
  onClose,
  sections,
  filters,
  setFilter,
  resetAll,
  resultCount,
  triggerRef,
}: FilterSheetProps) {
  const [openSection, setOpenSection] = useState<string | null>(null)
  const [expandedOptions, setExpandedOptions] = useState<Record<string, boolean>>({})
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  })

  // Mount + animate in/out, lock body scroll while open
  useEffect(() => {
    if (isOpen) {
      setMounted(true)
      setOpenSection(null)
      const raf = requestAnimationFrame(() => setVisible(true))
      const prevOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        cancelAnimationFrame(raf)
        document.body.style.overflow = prevOverflow
      }
    }
    setVisible(false)
    const timer = setTimeout(() => setMounted(false), 300)
    return () => clearTimeout(timer)
  }, [isOpen])

  // Escape to close + focus trap (depends only on isOpen; reads latest onClose via ref)
  useEffect(() => {
    if (!isOpen) return
    closeButtonRef.current?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const container = sheetRef.current
      if (!container) return
      const focusable = container.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  // Return focus to the trigger button on close
  const wasOpen = useRef(isOpen)
  useEffect(() => {
    if (wasOpen.current && !isOpen) triggerRef?.current?.focus()
    wasOpen.current = isOpen
  }, [isOpen, triggerRef])

  if (!mounted) return null

  return (
    <>
      {/* Scrim */}
      <div
        className={cn(
          'fixed inset-0 z-150 bg-black/40 transition-opacity duration-300 motion-reduce:transition-none',
          visible ? 'opacity-100' : 'opacity-0'
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Filter catalog"
        className={cn(
          'fixed inset-x-0 bottom-0 z-160 flex flex-col bg-white rounded-t-2xl shadow-(--shadow-lg)',
          'transition-transform duration-300 ease-out motion-reduce:transition-none',
          visible ? 'translate-y-0' : 'translate-y-full'
        )}
        style={{ maxHeight: '85vh' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-9 h-1 rounded-full bg-ink-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 border-b border-ink-200 shrink-0">
          <span
            className="text-ink-900 font-semibold"
            style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)' }}
          >
            Filters
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="flex items-center justify-center w-9 h-9 rounded-full text-ink-500 hover:bg-ink-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body: single-open accordion */}
        <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
          {sections.map((section) => {
            const { text: summary, active } = sectionSummary(section, filters)
            const open = openSection === section.key

            return (
              <div key={section.key} className="border-b border-ink-100 last:border-b-0">
                <button
                  type="button"
                  onClick={() => setOpenSection(open ? null : section.key)}
                  aria-expanded={open}
                  aria-controls={`sheet-section-${section.key}`}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 min-h-[48px] hover:bg-ink-50 transition-colors"
                >
                  <span
                    className="text-ink-900"
                    style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-body)' }}
                  >
                    {section.label}
                  </span>
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        'truncate max-w-[9.5rem]',
                        active ? 'text-green-700 font-medium' : 'text-ink-400'
                      )}
                      style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
                    >
                      {summary}
                    </span>
                    <ChevronDown
                      size={15}
                      className={cn(
                        'text-ink-400 shrink-0 transition-transform duration-200',
                        open && 'rotate-180'
                      )}
                    />
                  </span>
                </button>

                <div
                  id={`sheet-section-${section.key}`}
                  className={cn(
                    'grid transition-all duration-200 ease-in-out',
                    open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                  )}
                >
                  <div className="overflow-hidden">
                    <div className="px-4 pb-3">
                      {section.type === 'radio' ? (
                        <SheetRadioOptions
                          section={section}
                          value={filters[section.key]}
                          onChange={(v) => setFilter(section.key, v as never)}
                          expanded={!!expandedOptions[section.key]}
                          onExpand={() =>
                            setExpandedOptions((prev) => ({ ...prev, [section.key]: true }))
                          }
                        />
                      ) : (
                        <div className="flex gap-3">
                          <div className="flex-1">
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
                              placeholder="QA76"
                              className="w-full px-3 py-2.5 rounded-sm border border-ink-200 bg-white text-ink-900 placeholder:text-ink-300 focus:outline-none focus:border-green-700 transition-colors"
                              style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-mono)', minHeight: 44 }}
                            />
                          </div>
                          <div className="flex-1">
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
                              placeholder="QA99"
                              className="w-full px-3 py-2.5 rounded-sm border border-ink-200 bg-white text-ink-900 placeholder:text-ink-300 focus:outline-none focus:border-green-700 transition-colors"
                              style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-mono)', minHeight: 44 }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Sticky footer */}
        <div
          className="flex items-center gap-3 px-4 py-3 border-t border-ink-200 shrink-0"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={resetAll}
            className="flex-1 flex items-center justify-center px-4 py-3 rounded-(--radius-sm) border border-ink-300 text-ink-700 font-semibold hover:bg-ink-50 transition-colors min-h-[44px]"
            style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-[2] flex items-center justify-center px-4 py-3 rounded-(--radius-sm) bg-green-700 text-white font-semibold hover:bg-green-800 active:bg-green-900 transition-colors min-h-[44px]"
            style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
          >
            Show {resultCount} {resultCount === 1 ? 'result' : 'results'}
          </button>
        </div>
      </div>
    </>
  )
}

function SheetRadioOptions({
  section,
  value,
  onChange,
  expanded,
  onExpand,
}: {
  section: Extract<FilterSectionConfig, { type: 'radio' }>
  value: string
  onChange: (v: string) => void
  expanded: boolean
  onExpand: () => void
}) {
  const showTruncated = section.options.length > OPTION_TRUNCATE && !expanded
  const visibleOptions = showTruncated ? section.options.slice(0, OPTION_TRUNCATE) : section.options

  return (
    <div className="flex flex-col gap-0.5">
      {visibleOptions.map((opt) => {
        const checked = value === opt.value
        return (
          <label
            key={opt.value}
            className={cn(
              'flex items-center gap-3 cursor-pointer rounded-sm px-2 py-2.5 min-h-[44px] transition-colors select-none',
              checked ? 'bg-green-50' : 'hover:bg-ink-50'
            )}
          >
            <input
              type="radio"
              name={section.key}
              value={opt.value}
              checked={checked}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            <span
              className={cn(
                'shrink-0 w-4 h-4 rounded-full border-2 transition-colors flex items-center justify-center',
                checked ? 'border-green-700 bg-white' : 'border-ink-400 bg-white'
              )}
            >
              {checked && <span className="w-2 h-2 rounded-full bg-green-700" />}
            </span>
            <span
              className={cn('flex-1 leading-none', checked ? 'text-green-800 font-medium' : 'text-ink-700')}
              style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
            >
              {opt.label}
            </span>
          </label>
        )
      })}
      {showTruncated && (
        <button
          type="button"
          onClick={onExpand}
          className="self-start px-2 py-1.5 text-green-700 font-medium hover:text-green-900 underline underline-offset-2 transition-colors"
          style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}
        >
          Show all ({section.options.length})
        </button>
      )}
    </div>
  )
}
