// apps/web/components/ui/catalog/FilterChips.tsx
// Mobile quick-chip row (Filters button + shortcuts) and the applied-filter chip row
// shown below the search bar. Both render from the shared filterConfig — no duplicated
// filter option data.

'use client'

import { useEffect, useMemo, useState } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getUser } from '@/lib/auth'
import { catalogProgramFor } from '@/lib/catalogProgram'
import { collegeForProgram } from '@/lib/collegeForProgram'
import {
  CatalogFilters,
  DEFAULT_FILTERS,
  FilterSectionConfig,
  buildQuickChips,
  callNoSummary,
  isSectionActive,
  labelForValue,
} from './filterConfig'

// ─── Mobile quick-chip row ─────────────────────────────────────────────────────

type QuickChipRowProps = {
  filters: CatalogFilters
  activeCount: number
  onOpenSheet: () => void
  setFilter: <K extends keyof CatalogFilters>(key: K, value: CatalogFilters[K]) => void
  filtersButtonRef?: React.RefObject<HTMLButtonElement | null>
  /** The catalog's Program and College values, to match the patron's own against. */
  genres: string[]
  subjects: string[]
}

export function QuickChipRow({
  filters,
  activeCount,
  onOpenSheet,
  setFilter,
  filtersButtonRef,
  genres,
  subjects,
}: QuickChipRowProps) {
  // getUser() reads browser storage, so it's only read after mount — reading
  // it during render would differ between the server and client HTML.
  const [profile, setProfile] = useState<{ program: string | null; college: string | null }>({
    program: null,
    college: null,
  })
  useEffect(() => {
    const user = getUser()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of browser storage after mount
    setProfile({
      program: user?.program ?? null,
      college: user?.college || collegeForProgram(user?.program),
    })
  }, [])

  const chips = useMemo(
    () =>
      buildQuickChips({
        program: catalogProgramFor(profile.program, genres),
        college: profile.college,
        subjects,
      }),
    [profile, genres, subjects]
  )

  return (
    <div className="lg:hidden flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 mb-4">
      <button
        ref={filtersButtonRef}
        type="button"
        onClick={onOpenSheet}
        className="flex items-center gap-1.5 shrink-0 px-3.5 py-2 rounded-full bg-green-800 text-white font-semibold hover:bg-green-900 transition-colors min-h-[36px]"
        style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
      >
        <SlidersHorizontal size={13} />
        {activeCount > 0 ? `Filters · ${activeCount}` : 'Filters'}
      </button>

      {chips.map((chip) => {
        const active = filters[chip.key] === chip.value
        return (
          <button
            key={`${chip.key}-${chip.value}`}
            type="button"
            onClick={() =>
              setFilter(chip.key, (active ? DEFAULT_FILTERS[chip.key] : chip.value) as never)
            }
            className={cn(
              'shrink-0 px-3.5 py-2 rounded-full border font-medium transition-colors min-h-[36px]',
              active
                ? 'bg-green-700 border-green-700 text-white'
                : 'bg-white border-ink-200 text-ink-600 hover:border-ink-300'
            )}
            style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm-body)' }}
          >
            {chip.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Applied filter chips ───────────────────────────────────────────────────────

type AppliedChipsProps = {
  filters: CatalogFilters
  sections: FilterSectionConfig[]
  resetSection: (key: 'genre' | 'availability' | 'format' | 'floor' | 'subject' | 'callNo') => void
  resetAll: () => void
}

export function AppliedChips({ filters, sections, resetSection, resetAll }: AppliedChipsProps) {
  const active = sections.filter((s) => isSectionActive(s, filters))
  if (active.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <span
        className="text-ink-400"
        style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}
      >
        Active:
      </span>
      {active.map((section) => {
        const label =
          section.type === 'range' ? callNoSummary(filters) : labelForValue(section, filters[section.key])
        return (
          <span
            key={section.key}
            className="flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 rounded-full bg-green-100 text-green-800 font-medium"
          >
            <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}>{label}</span>
            <button
              type="button"
              onClick={() => resetSection(section.key)}
              aria-label={`Clear ${section.label} filter`}
              className="flex items-center justify-center w-4 h-4 rounded-full text-green-600 hover:text-green-900 hover:bg-green-200 transition-colors"
            >
              <X size={10} />
            </button>
          </span>
        )
      })}
      <button
        type="button"
        onClick={resetAll}
        className="text-green-700 font-medium hover:text-green-900 underline underline-offset-2 transition-colors"
        style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)' }}
      >
        Clear all
      </button>
    </div>
  )
}
