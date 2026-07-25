import { useState } from "react"

export type PaginationWindow<T> = {
  pageItems: Array<T>
  currentPage: number
  totalPages: number
}

/**
 * Pure windowing math, kept separate from the `useState` wrapper below so it
 * can be unit-tested with no React/DOM machinery involved. Clamps `page`
 * against the actual item count instead of assuming it's already valid - a
 * list that shrank out from under a stale page number (an item removed, a
 * bulk delete) falls back to the last valid page.
 */
export function paginate<T>(
  items: ReadonlyArray<T>,
  page: number,
  pageSize: number
): PaginationWindow<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const currentPage = Math.min(Math.max(1, page), totalPages)
  const pageItems = items.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )
  return { pageItems, currentPage, totalPages }
}

export type PaginationResult<T> = PaginationWindow<T> & {
  goToNextPage: () => void
  goToPreviousPage: () => void
}

/** Windows `items` into pages of `pageSize`; see `paginate` for the clamping behavior. */
export function usePagination<T>(
  items: ReadonlyArray<T>,
  pageSize: number
): PaginationResult<T> {
  const [page, setPage] = useState(1)
  const window = paginate(items, page, pageSize)

  return {
    ...window,
    goToNextPage: () => setPage((p) => p + 1),
    goToPreviousPage: () => setPage((p) => p - 1),
  }
}
