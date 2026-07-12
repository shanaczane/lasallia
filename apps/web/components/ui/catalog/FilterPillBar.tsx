// apps/web/components/ui/catalog/FilterPillBar.tsx
// Inline per-category filter dropdowns shown beside the search bar, matching
// the "Genre: X ⌄ Availability ⌄ Format ⌄ Floor ⌄ Subject ⌄ Call no." pattern.
// Covers every field in CatalogFilters directly — no separate "more filters"
// panel needed.

'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BookStatus, BookFormat } from '@lasallia/types'
import { CatalogFilters, AVAIL_OPTIONS, FORMAT_OPTIONS } from './FilterSidebar'

type PillId = 'genre' | 'availability' | 'format' | 'floor' | 'subject' | 'callno'

type FilterPillBarProps = {
  filters: CatalogFilters
  onChange: (filters: CatalogFilters) => void
  genres: string[]
  floors: string[]
  subjects: string[]
}

function PillOption({
  checked,
  label,
  onClick,
}: {
  checked: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 w-full text-left rounded-sm px-2.5 py-1.5 transition-colors',
        checked ? 'bg-green-50' : 'hover:bg-ink-50'
      )}
    >
      <span
        className={cn(
          'shrink-0 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center',
          checked ? 'border-green-700 bg-white' : 'border-ink-300 bg-white'
        )}
      >
        {checked && <span className="w-1.5 h-1.5 rounded-full bg-green-700" />}
      </span>
      <span
        className={cn('flex-1 truncate', checked ? 'text-green-800 font-medium' : 'text-ink-600')}
        style={{ fontSize: 'var(--text-sm-body)', fontFamily: 'var(--font-body)' }}
      >
        {label}
      </span>
    </button>
  )
}

export function FilterPillBar({
  filters,
  onChange,
  genres,
  floors,
  subjects,
}: FilterPillBarProps) {
  const [openId, setOpenId] = useState<PillId | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openId) return
    function handlePointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpenId(null)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenId(null)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [openId])

  const set = <K extends keyof CatalogFilters>(key: K, value: CatalogFilters[K]) =>
    onChange({ ...filters, [key]: value })

  const genreOptions = genres.map((g) => ({ value: g === 'All' ? 'all' : g, label: g }))
  const floorOptions = floors.map((f) => ({ value: f === 'All' ? 'all' : f, label: f }))
  const subjectOptions = subjects.map((s) => ({ value: s === 'All' ? 'all' : s, label: s }))

  const callNoActive = filters.call_number_start !== '' || filters.call_number_end !== ''

  const pills: Array<{
    id: PillId
    label: string
    active: boolean
    valueLabel?: string
    panel: React.ReactNode
  }> = [
    {
      id: 'genre',
      label: 'Genre',
      active: filters.genre !== 'all',
      valueLabel: filters.genre !== 'all' ? filters.genre : undefined,
      panel: (
        <div className="flex flex-col gap-0.5 max-h-72 overflow-y-auto">
          {genreOptions.map((opt) => (
            <PillOption
              key={opt.value}
              checked={filters.genre === opt.value}
              label={opt.label}
              onClick={() => { set('genre', opt.value); setOpenId(null) }}
            />
          ))}
        </div>
      ),
    },
    {
      id: 'availability',
      label: 'Availability',
      active: filters.availability !== 'all',
      valueLabel: filters.availability !== 'all'
        ? AVAIL_OPTIONS.find((o) => o.value === filters.availability)?.label
        : undefined,
      panel: (
        <div className="flex flex-col gap-0.5">
          {AVAIL_OPTIONS.map((opt) => (
            <PillOption
              key={opt.value}
              checked={filters.availability === opt.value}
              label={opt.label}
              onClick={() => { set('availability', opt.value as BookStatus | 'all'); setOpenId(null) }}
            />
          ))}
        </div>
      ),
    },
    {
      id: 'format',
      label: 'Format',
      active: filters.format !== 'all',
      valueLabel: filters.format !== 'all'
        ? FORMAT_OPTIONS.find((o) => o.value === filters.format)?.label
        : undefined,
      panel: (
        <div className="flex flex-col gap-0.5">
          {FORMAT_OPTIONS.map((opt) => (
            <PillOption
              key={opt.value}
              checked={filters.format === opt.value}
              label={opt.label}
              onClick={() => { set('format', opt.value as BookFormat | 'all'); setOpenId(null) }}
            />
          ))}
        </div>
      ),
    },
    {
      id: 'floor',
      label: 'Floor',
      active: filters.floor !== 'all',
      valueLabel: filters.floor !== 'all' ? filters.floor : undefined,
      panel: (
        <div className="flex flex-col gap-0.5">
          {floorOptions.map((opt) => (
            <PillOption
              key={opt.value}
              checked={filters.floor === opt.value}
              label={opt.label}
              onClick={() => { set('floor', opt.value); setOpenId(null) }}
            />
          ))}
        </div>
      ),
    },
    {
      id: 'subject',
      label: 'Subject',
      active: filters.subject !== 'all',
      valueLabel: filters.subject !== 'all' ? filters.subject : undefined,
      panel: (
        <div className="flex flex-col gap-0.5 max-h-72 overflow-y-auto">
          {subjectOptions.map((opt) => (
            <PillOption
              key={opt.value}
              checked={filters.subject === opt.value}
              label={opt.label}
              onClick={() => { set('subject', opt.value); setOpenId(null) }}
            />
          ))}
        </div>
      ),
    },
    {
      id: 'callno',
      label: 'Call no.',
      active: callNoActive,
      valueLabel: callNoActive
        ? `${filters.call_number_start || '…'}–${filters.call_number_end || '…'}`
        : undefined,
      panel: (
        <div className="flex flex-col gap-2 w-44">
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
      ),
    },
  ]

  return (
    <div ref={containerRef} className="flex items-center gap-2 flex-wrap">
      {pills.map((pill) => (
        <div key={pill.id} className="relative">
          <button
            type="button"
            onClick={() => setOpenId((v) => (v === pill.id ? null : pill.id))}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full border font-medium transition-colors max-w-40',
              pill.active
                ? 'bg-green-50 border-green-700 text-green-800'
                : 'bg-white border-ink-200 text-ink-600 hover:border-ink-300'
            )}
            style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)' }}
          >
            <span className="truncate">
              {pill.valueLabel ? `${pill.label}: ${pill.valueLabel}` : pill.label}
            </span>
            <ChevronDown
              size={13}
              className={cn('shrink-0 transition-transform', openId === pill.id && 'rotate-180')}
            />
          </button>

          {openId === pill.id && (
            <div
              className="absolute left-0 top-full mt-1.5 z-50 min-w-44 bg-white rounded-[10px] border border-ink-200 shadow-(--shadow-lg) p-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              {pill.panel}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
