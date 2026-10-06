import { useCallback, useLayoutEffect, useRef, useState } from "react"
import type { RefObject } from "react"

export type FittedPage<T> = {
  /** Attach to the element the page must fit inside. */
  viewportRef: RefObject<HTMLDivElement | null>
  /** Attach to the element that actually holds the items. */
  contentRef: RefObject<HTMLDivElement | null>
  /** The slice to render. Never empty while `items` is non-empty. */
  pageItems: Array<T>
  /** 0-based. */
  page: number
  pageCount: number
  perPage: number
  goToPage: (page: number) => void
  next: () => void
  previous: () => void
  /** True while the fit is still settling, for suppressing a first-paint flash. */
  isMeasuring: boolean
}

type Options<T> = {
  /**
   * Never show fewer than this many, even if they genuinely do not fit — one
   * item that is taller than the viewport has to overflow *somewhere*, and
   * showing zero items is the one outcome that is never useful.
   */
  minPerPage?: number
  /** Upper bound on the fitted count, so a very tall viewport doesn't render an unbounded page. */
  maxPerPage?: number
  /**
   * Identifies each item across renders, for a caller that rebuilds `items`
   * whenever any one item changes (editing one field via `.map()`). Without
   * it, that rebuild reads like a search swapping in new results, and the
   * one-shot floor retry it earns can regrow `perPage` past a count already
   * measured too tall. Omit when items are only added, removed or swapped
   * wholesale: plain identity covers those.
   */
  getItemKey?: (item: T, index: number) => string | number
}

const DEFAULT_MIN_PER_PAGE = 1
const DEFAULT_MAX_PER_PAGE = 24

/**
 * Show as many list items as actually fit the available height, and page the
 * rest, instead of handing the overflow to a scrollbar. A fixed page size is
 * wrong at every viewport but one.
 *
 * The fit is found by *probing*, not by arithmetic on a row height: rows are
 * not uniform and the grid may have several columns, where the next item
 * often costs no extra height because it joins the row already on screen. So
 * each pass tries one more and lets the next measurement rule on it. Three
 * rules make up the whole algorithm:
 *
 * 1. **Overflow shrinks, always.** `used > available` is a real measurement,
 *    and giving an item back is never wrong.
 *
 * 2. **A rejected count is rejected for the whole list, not for the page it
 *    was rejected on.** `overflowFloor` is the smallest count any page has
 *    been seen to overflow at, for the current box geometry; growth never
 *    proposes it or anything above it again. That makes probing terminate
 *    (no count is tried twice; the walk is bounded by `maxPerPage`) and makes
 *    the fit correct across pages.
 *
 *    The floor is invalidated only by the box changing size, or the list
 *    changing length (which tears the effect down). It is deliberately not
 *    keyed on React state: array identity reads every render as new content
 *    for a caller that does not memoize, and keying on viewport/page misses a
 *    badge disappearing and un-wrapping a row. A same-length swap still earns
 *    a one-shot retry when the caller's change (not the hook's own
 *    convergence step) changes what `items` identifies; see `getItemKey`.
 *
 * 3. **Only a full page is evidence of room.** On the last page the list has
 *    run out, so spare space there says nothing about how much fits. Reading
 *    it as room grew `perPage`, collapsed `pageCount`, and clamped the page
 *    back, so Next looked like a dead button.
 *
 * Reaching the fit takes several passes, and the DOM need not resize between
 * them (a card joining a row no taller than before), so the
 * `ResizeObserver` may report nothing. Each pass that changes `perPage`
 * schedules the next itself, and page changes or item swaps schedule their
 * own pass too.
 *
 * Both refs are required: a `min-h-0` flex child measured against itself
 * reports the height it was given, not the height it wants.
 */
/**
 * Whether two `itemsSignature` readings represent the same items. Element-wise
 * comparison, not a joined string, keeps arbitrary string/number keys
 * collision-free.
 */
function sameItemsSignature(
  previous: ReadonlyArray<string | number> | ReadonlyArray<unknown>,
  current: ReadonlyArray<string | number> | ReadonlyArray<unknown>,
  hasGetItemKey: boolean
): boolean {
  if (previous === current) return true
  if (!hasGetItemKey || previous.length !== current.length) return false
  return previous.every((key, index) => key === current[index])
}

export function useFittedPage<T>(
  items: ReadonlyArray<T>,
  {
    minPerPage = DEFAULT_MIN_PER_PAGE,
    maxPerPage = DEFAULT_MAX_PER_PAGE,
    getItemKey,
  }: Options<T> = {}
): FittedPage<T> {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)

  const [perPage, setPerPage] = useState(minPerPage)
  const [page, setPage] = useState(0)
  const [isMeasuring, setIsMeasuring] = useState(true)
  const [listLength, setListLength] = useState(items.length)

  const pageCount = Math.max(1, Math.ceil(items.length / Math.max(1, perPage)))
  const safePage = Math.min(page, pageCount - 1)
  const start = safePage * perPage

  // What "the items changed" means for the retry grant. Without
  // `getItemKey`, the array reference; with it, the ordered keys, so an
  // in-place mutation that rebuilds the array is not a swap. An array, not a
  // joined string: `["a|b", "c"]` and `["a", "b|c"]` join identically.
  const itemsSignature: ReadonlyArray<string | number> | ReadonlyArray<T> =
    getItemKey ? items.map((item, index) => getItemKey(item, index)) : items

  // Adjusted during render (React's "adjusting state when props change"), so
  // no frame paints an out-of-range slice. A different list resets the page;
  if (listLength !== items.length) {
    setListLength(items.length)
    setPage(0)
  } else if (safePage !== page) {
    // a page that no longer exists (the fit grew) is clamped.
    setPage(safePage)
  }

  // Read by the measuring effect without being its dependencies: resubscribing
  // on every change would discard `overflowFloor` and undo rule 2. A ref
  // cannot be written during render, so this dependency-less layout effect
  // keeps it current, and schedules a pass when the page or items changed
  // with no DOM resize to observe.
  const latestRef = useRef({ perPage, itemsSignature, page: safePage })
  const scheduleRef = useRef<(() => void) | null>(null)
  // One-shot permission for the next growth attempt to ignore the floor,
  // earned only by the list's contents being swapped (rule 2), not by paging.
  const retryFloorRef = useRef(false)
  // Set immediately before `settle` calls `setPerPage`, so the effect below
  // can tell this hook's own convergence renders apart from a caller's.
  const settlingRef = useRef(false)
  useLayoutEffect(() => {
    const previous = latestRef.current
    latestRef.current = { perPage, itemsSignature, page: safePage }
    const isOwnConvergenceStep = settlingRef.current
    settlingRef.current = false
    if (
      !sameItemsSignature(
        previous.itemsSignature,
        itemsSignature,
        Boolean(getItemKey)
      )
    ) {
      if (!isOwnConvergenceStep) retryFloorRef.current = true
      scheduleRef.current?.()
    } else if (previous.page !== safePage) {
      scheduleRef.current?.()
    }
  })

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return undefined

    let frame = 0

    // Rule 2's floor: a property of the list, not of the page that proved it.
    let overflowFloor = Number.POSITIVE_INFINITY
    // The box each count was seen in. The pager exists only with more than
    // one page, so a count that changes the page count changes the box
    // itself; only "the same count now produces a different box" means the
    // outside changed.
    const measuredAt = new Map<number, { available: number; width: number }>()
    // Tells content changing height on its own (same page and count) apart
    // from this hook's own steps, which are expected to change the height.
    let lastPass: { perPage: number; page: number; used: number } | null = null

    const settle = (): void => {
      const available = viewport.clientHeight
      const used = content.scrollHeight
      if (available === 0) return

      // `offsetWidth`, not `clientWidth`: a classic scrollbar takes its width
      // out of `clientWidth` exactly while content overflows, so every
      // rejected probe changed the "box", voided its own floor, and retried
      // forever with a flickering scrollbar. Height stays `clientHeight`:
      // nothing here gains a horizontal bar from probing.
      const width = viewport.offsetWidth

      const current = latestRef.current.perPage

      // A box of a different size voids every answer learned about the old
      // one; this is the only in-pass floor reset besides the two below.
      // Judged per count (see `measuredAt`): with one remembered box, the
      // pager appearing at one per page voided the rejection of two, and two
      // was retried forever.
      const seen = measuredAt.get(current)
      if (
        seen !== undefined &&
        (seen.available !== available || seen.width !== width)
      ) {
        measuredAt.clear()
        overflowFloor = Number.POSITIVE_INFINITY
      }
      measuredAt.set(current, { available, width })

      // Spent on the next attempt whether or not it needs it.
      const retryFloor = retryFloorRef.current
      retryFloorRef.current = false
      if (retryFloor) overflowFloor = Number.POSITIVE_INFINITY

      // Height driven by state outside `items` (a badge that changes what
      // wraps) shows only as the rendered height changing while `perPage`
      // and the page held still.
      const currentPass = {
        perPage: latestRef.current.perPage,
        page: latestRef.current.page,
        used,
      }
      if (
        lastPass !== null &&
        lastPass.perPage === currentPass.perPage &&
        lastPass.page === currentPass.page &&
        lastPass.used !== used
      ) {
        overflowFloor = Number.POSITIVE_INFINITY
      }
      lastPass = currentPass

      const clamp = (value: number): number =>
        Math.min(maxPerPage, Math.max(minPerPage, value))

      const currentPage = latestRef.current.page
      let settled = current

      if (used > available && current > minPerPage) {
        // Rule 1, and the only place rule 2's floor is learned.
        overflowFloor = Math.min(overflowFloor, current)
        settled = clamp(current - 1)
      } else if (used <= available) {
        // Rule 3: only a full page testifies to room, judged on the slice
        // growth would produce. Growth is limited to page 0, the only page
        // whose start (`page * perPage`) does not move when `perPage` grows:
        // on page 1 at one per page, growing to two swaps the on-screen item
        // for two others, a full and valid page nothing else would catch. A
        // nonzero page still shrinks on overflow and regrows back on page 0.
        const proposed = current + 1
        const growthFillsThisPage =
          currentPage * proposed + proposed <= items.length
        const hasMoreToShow = current < items.length

        if (
          currentPage === 0 &&
          growthFillsThisPage &&
          hasMoreToShow &&
          proposed < overflowFloor &&
          proposed <= maxPerPage
        ) {
          settled = clamp(proposed)
        }
      }

      setIsMeasuring(false)

      // Reschedule ourselves on a change: the DOM need not resize between
      // two convergence steps, so the ResizeObserver may stay quiet.
      if (settled !== current) {
        settlingRef.current = true
        setPerPage(settled)
        schedule()
      }
    }

    const schedule = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(settle)
    }

    // For the page/items effect above, which this effect does not depend on.
    scheduleRef.current = schedule
    schedule()

    // Absent in jsdom and on the server: the fit is measured once on mount
    // and never revised, rather than throwing.
    if (typeof ResizeObserver === "undefined") {
      return (): void => {
        scheduleRef.current = null
        cancelAnimationFrame(frame)
      }
    }

    const observer = new ResizeObserver(schedule)
    observer.observe(viewport)
    observer.observe(content)

    return (): void => {
      scheduleRef.current = null
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [items.length, minPerPage, maxPerPage])

  const goToPage = useCallback(
    (next: number) => {
      setPage(Math.min(Math.max(0, next), Math.max(0, pageCount - 1)))
    },
    [pageCount]
  )

  const next = useCallback(() => goToPage(safePage + 1), [goToPage, safePage])
  const previous = useCallback(
    () => goToPage(safePage - 1),
    [goToPage, safePage]
  )

  const pageItems = items.slice(start, start + perPage)

  return {
    viewportRef,
    contentRef,
    pageItems: [...pageItems],
    page: safePage,
    pageCount,
    perPage,
    goToPage,
    next,
    previous,
    isMeasuring,
  }
}
