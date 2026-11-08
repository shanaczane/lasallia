// Paging for a table whose rows can be replaced (new filters, a reload):
// back to page 1 whenever the rows change.
//
// The page is stored together with the rows it belongs to, and read as 1
// when they differ. Nothing is set during render, so this can't loop, even
// when the caller passes a new array on every render (like `rows ?? []`
// while loading), which made the Usage tab hit "Too many re-renders".

import { useState } from "react"

export type PageState<T> = { rows: readonly T[] | null | undefined; page: number }

// The page to show: the stored one if it belongs to these rows, else 1, and
// never past the last page.
export function currentPage<T>(state: PageState<T>, rows: readonly T[] | null | undefined, totalPages: number): number {
  const page = state.rows === rows ? state.page : 1
  return Math.min(Math.max(1, page), Math.max(1, totalPages))
}

export function usePagedRows<T>(rows: readonly T[] | null | undefined, pageSize: number) {
  const [state, setState] = useState<PageState<T>>({ rows, page: 1 })
  const all = rows ?? []
  const totalPages = Math.max(1, Math.ceil(all.length / pageSize))
  const page = currentPage(state, rows, totalPages)
  return {
    page,
    totalPages,
    paged: all.slice((page - 1) * pageSize, page * pageSize),
    setPage: (next: number) => setState({ rows, page: next }),
  }
}
