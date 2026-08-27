// apps/web/components/ui/catalog/filterConfig.ts
// Single source of truth for catalog filter sections, defaults, and matching logic.
// Consumed by FilterSidebar (desktop), FilterSheet (mobile), and FilterChips.

import { Book, BookStatus, BookFormat } from '@lasallia/types'

export type CatalogFilters = {
  genre: string
  availability: BookStatus | 'all'
  format: BookFormat | 'all'
  floor: string
  subject: string
  call_number_start: string
  call_number_end: string
}

export const DEFAULT_FILTERS: CatalogFilters = {
  genre: 'all',
  availability: 'all',
  format: 'all',
  floor: 'all',
  subject: 'all',
  call_number_start: '',
  call_number_end: '',
}

export type FilterOption = { value: string; label: string }

export type RadioFilterKey = 'genre' | 'availability' | 'format' | 'floor' | 'subject'

export type RadioFilterSection = {
  key: RadioFilterKey
  label: string
  type: 'radio'
  options: FilterOption[]
}

export type RangeFilterSection = {
  key: 'callNo'
  label: string
  type: 'range'
}

export type FilterSectionConfig = RadioFilterSection | RangeFilterSection

export const AVAILABILITY_OPTIONS: FilterOption[] = [
  { value: 'all', label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'borrowed', label: 'Borrowed' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'misplaced', label: 'Missing' },
]

export const FORMAT_OPTIONS: FilterOption[] = [
  { value: 'all', label: 'All' },
  { value: 'print', label: 'Print' },
  { value: 'digital', label: 'Digital' },
  { value: 'reference', label: 'Reference' },
]

function toOptions(values: string[]): FilterOption[] {
  return values.map((v) => ({ value: v === 'All' ? 'all' : v, label: v }))
}

export function buildFilterSections(source: {
  genres: string[]
  subjects: string[]
  floors: string[]
}): FilterSectionConfig[] {
  return [
    { key: 'genre', label: 'Program', type: 'radio', options: toOptions(source.genres) },
    { key: 'availability', label: 'Availability', type: 'radio', options: AVAILABILITY_OPTIONS },
    { key: 'format', label: 'Format', type: 'radio', options: FORMAT_OPTIONS },
    { key: 'floor', label: 'Floor location', type: 'radio', options: toOptions(source.floors) },
    { key: 'subject', label: 'College', type: 'radio', options: toOptions(source.subjects) },
    { key: 'callNo', label: 'Call no. range', type: 'range' },
  ]
}

export type QuickChipDef = { key: RadioFilterKey; value: string; label: string }

export const QUICK_CHIPS: QuickChipDef[] = [
  { key: 'availability', value: 'available', label: 'Available' },
  { key: 'genre', value: 'Computer Science', label: 'Computer Science' },
  { key: 'format', value: 'digital', label: 'E-Book' },
]

export function isSectionActive(section: FilterSectionConfig, filters: CatalogFilters): boolean {
  if (section.type === 'range') {
    return filters.call_number_start !== '' || filters.call_number_end !== ''
  }
  return filters[section.key] !== DEFAULT_FILTERS[section.key]
}

export function countActiveFilters(filters: CatalogFilters): number {
  let n = 0
  if (filters.genre !== 'all') n++
  if (filters.availability !== 'all') n++
  if (filters.format !== 'all') n++
  if (filters.floor !== 'all') n++
  if (filters.subject !== 'all') n++
  if (filters.call_number_start !== '' || filters.call_number_end !== '') n++
  return n
}

export function labelForValue(section: RadioFilterSection, value: string): string {
  return section.options.find((o) => o.value === value)?.label ?? value
}

export function callNoSummary(filters: CatalogFilters): string {
  const { call_number_start: from, call_number_end: to } = filters
  if (!from && !to) return 'Any'
  return `${from || '…'} – ${to || '…'}`
}

export function filterBooksByCatalogFilters(books: Book[], filters: CatalogFilters): Book[] {
  return books.filter((book) => {
    if (filters.genre !== 'all' && book.category !== filters.genre) return false
    if (filters.availability !== 'all' && book.status !== filters.availability) return false
    if (filters.subject !== 'all' && book.subject !== filters.subject) return false
    if (filters.format !== 'all' && book.format !== filters.format) return false
    if (filters.floor !== 'all' && book.floor !== filters.floor) return false
    if (filters.call_number_start && book.call_number < filters.call_number_start) return false
    if (filters.call_number_end && book.call_number > filters.call_number_end) return false
    return true
  })
}
