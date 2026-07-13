// apps/web/components/ui/catalog/index.ts
export { BookCard } from './BookCard'
export { BookGrid } from './BookGrid'
export { CatalogSearchBar } from './CatalogSearchBar'
export { FilterSidebar } from './FilterSidebar'
export { FilterSheet } from './FilterSheet'
export { FilterPillBar } from './FilterPillBar'
export { QuickChipRow, AppliedChips } from './FilterChips'
export { useCatalogFilters } from './useCatalogFilters'
export type {
  CatalogFilters,
  FilterSectionConfig,
  RadioFilterKey,
} from './filterConfig'
export {
  DEFAULT_FILTERS,
  buildFilterSections,
  filterBooksByCatalogFilters,
} from './filterConfig'
// Librarian Sprint 5.2
export { LibrarianBookCard } from './LibrarianBookCard'
export { BookFormModal } from './BookFormModal'
export type { BookFormData } from './BookFormModal'
export { CopyManagementTable } from './CopyManagementTable'
export type { BookCopy, CopyStatus } from './CopyManagementTable'
export { DeleteBookModal } from './DeleteBookModal'