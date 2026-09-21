// apps/web/components/ui/catalog/useCatalogFilters.ts
// Single source of truth for catalog filter state — synced to URL search params
// so filtered views are shareable and back-button friendly.

'use client'

import { useCallback, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { BookStatus, BookFormat } from '@lasallia/types'
import { CatalogFilters, DEFAULT_FILTERS, countActiveFilters } from './filterConfig'

const PARAM_KEYS: Record<keyof CatalogFilters, string> = {
  genre: 'genre',
  availability: 'availability',
  format: 'format',
  floor: 'floor',
  subject: 'subject',
  call_number_start: 'callFrom',
  call_number_end: 'callTo',
}

function filtersFromParams(params: URLSearchParams): CatalogFilters {
  return {
    genre: params.get(PARAM_KEYS.genre) ?? DEFAULT_FILTERS.genre,
    availability: (params.get(PARAM_KEYS.availability) as BookStatus | 'all' | null) ?? DEFAULT_FILTERS.availability,
    format: (params.get(PARAM_KEYS.format) as BookFormat | 'all' | null) ?? DEFAULT_FILTERS.format,
    floor: params.get(PARAM_KEYS.floor) ?? DEFAULT_FILTERS.floor,
    subject: params.get(PARAM_KEYS.subject) ?? DEFAULT_FILTERS.subject,
    call_number_start: params.get(PARAM_KEYS.call_number_start) ?? '',
    call_number_end: params.get(PARAM_KEYS.call_number_end) ?? '',
  }
}

// programToCollege keeps Program and College in step: picking a Program also
// selects the college it belongs to, and picking a College that doesn't
// contain the current Program clears the Program. When a single apply changes
// both (the mobile sheet), the user's explicit pair is respected as-is.
export function useCatalogFilters(programToCollege: Record<string, string> = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams])

  const applyFilters = useCallback(
    (requested: CatalogFilters) => {
      const next = { ...requested }
      const genreChanged = next.genre !== filters.genre
      const subjectChanged = next.subject !== filters.subject
      if (genreChanged && !subjectChanged && next.genre !== 'all' && programToCollege[next.genre]) {
        next.subject = programToCollege[next.genre]
      } else if (subjectChanged && !genreChanged && next.subject !== 'all' && next.genre !== 'all' && programToCollege[next.genre] !== next.subject) {
        next.genre = 'all'
      }
      const params = new URLSearchParams(searchParams.toString())
      ;(Object.keys(PARAM_KEYS) as Array<keyof CatalogFilters>).forEach((key) => {
        const paramName = PARAM_KEYS[key]
        const value = next[key]
        if (!value || value === 'all') params.delete(paramName)
        else params.set(paramName, value)
      })
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams, filters, programToCollege]
  )

  const setFilter = useCallback(
    <K extends keyof CatalogFilters>(key: K, value: CatalogFilters[K]) => {
      applyFilters({ ...filters, [key]: value })
    },
    [filters, applyFilters]
  )

  const resetSection = useCallback(
    (key: RadioFilterKeyOrCallNo) => {
      if (key === 'callNo') {
        applyFilters({ ...filters, call_number_start: '', call_number_end: '' })
      } else {
        applyFilters({ ...filters, [key]: DEFAULT_FILTERS[key] })
      }
    },
    [filters, applyFilters]
  )

  const resetAll = useCallback(() => applyFilters(DEFAULT_FILTERS), [applyFilters])

  const activeCount = useMemo(() => countActiveFilters(filters), [filters])

  return {
    filters,
    setFilter,
    setFilters: applyFilters,
    resetSection,
    resetAll,
    activeCount,
    hasActive: activeCount > 0,
  }
}

type RadioFilterKeyOrCallNo = 'genre' | 'availability' | 'format' | 'floor' | 'subject' | 'callNo'
