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

type Options = {
  /**
   * Never show fewer than this many, even if they genuinely do not fit — one
   * item that is taller than the viewport has to overflow *somewhere*, and
   * showing zero items is the one outcome that is never useful.
   */
  minPerPage?: number
  /** Upper bound on the fitted count, so a very tall viewport doesn't render an unbounded page. */
  maxPerPage?: number
}

const DEFAULT_MIN_PER_PAGE = 1
const DEFAULT_MAX_PER_PAGE = 24

/**
 * Show as many list items as actually fit the available height, and page the
 * rest — instead of letting the list grow and handing the overflow to a
 * scrollbar.
 *
 * Why measured rather than a fixed page size: a constant is wrong at every
 * viewport but one. Five rows overflow a short window and waste half a tall
 * one, and "responsive" then means "picks a different wrong number per
 * breakpoint". The only page size that always fits is the one derived from
 * the box it has to fit in.
 *
 * The fit is found by *probing* rather than by arithmetic on a measured row
 * height. Rows here are not uniform (a two-line label is taller than a
 * one-line one) and the grid they sit in is not necessarily one column, so
 * there is no estimate that answers "would one more fit" correctly: dividing
 * by an average silently overflows on the pages with the tall rows, and in a
 * multi-column grid the next item frequently costs *no* extra height at all
 * because it joins the row already on screen. An estimate that assumes
 * vertical stacking therefore under-fills a `sm:grid-cols-2` catalogue by
 * half — a real symptom, not a hypothetical one: at 780×390 the composer's
 * picker sat at one card per page, and paged to "1 / 4", inside a box with
 * room for the other card beside it.
 *
 * So each pass simply tries one more and lets the *next* measurement rule on
 * it. Three rules keep that honest, and between them they are the whole
 * algorithm:
 *
 * 1. **Overflow shrinks, always.** `used > available` is a real measurement
 *    of real content, and the page giving an item back is never wrong.
 *
 * 2. **A rejected count is rejected for the whole list, not for the page it
 *    was rejected on.** `perPage` is one number governing every page, so the
 *    bound on it has to be one number too. `overflowFloor` is the smallest
 *    count any page has been *seen* to overflow at, for the current box
 *    geometry; growth never proposes it or anything above it again. That is
 *    what makes probing terminate: a proposal either fits (and `perPage`
 *    rises) or lowers the floor to itself (and is never proposed again), so
 *    no count is ever tried twice and the walk is bounded by `maxPerPage`.
 *    It is also what makes the fit *correct* rather than merely stable —
 *    a count that overflows page 3 overflows page 3 no matter which page is
 *    showing when it is next proposed, and a hook that forgets that between
 *    pages is choosing a page size that does not fit.
 *
 *    Deliberately not keyed on "did the content change" inferred from the
 *    caller's React state. Two attempts at that inference were each wrong in
 *    a different real direction: keying on the item array's identity reads
 *    every render as new content for a caller that rebuilds its rows without
 *    memoizing, defeating the guard permanently; keying on the viewport and
 *    page instead misses a genuine change that touches neither, such as a
 *    badge disappearing and un-wrapping a row. Both questions disappear if
 *    the floor is invalidated only by the one thing that genuinely
 *    invalidates a fit — the box being a different size — plus the list
 *    being a different length, which tears the whole measurement down and
 *    rebuilds it (see this effect's dependencies). Neither is a proxy for
 *    anything; both are numbers off the DOM and the input.
 *
 * 3. **Only a full page is evidence of room.** This is the rule whose absence
 *    was the bug that motivated the rewrite. On the last page the list has
 *    run out, so `used` is small for a reason that has nothing to do with how
 *    much fits: at four activities and three per page, page 2 holds one card
 *    in a box sized for three. Reading that leftover space as "room for a
 *    fourth per page" grew `perPage` to 4, which collapsed `pageCount` to 1,
 *    which clamped the page index back to 0 — so pressing Next flashed page 2
 *    and then landed back on page 1, looking for all the world like a dead
 *    button. Growth now requires the current page to actually be full, so
 *    the only spare space it can ever read is spare space that a further item
 *    would genuinely occupy.
 *
 * Reaching the fit takes several passes in a row, and nothing about the DOM
 * necessarily changes size between two of them — adding a card into a grid
 * row that was already exactly that tall changes what is rendered without
 * changing `content`'s own height, so the `ResizeObserver` below reports
 * nothing. Each pass therefore explicitly requests the next one itself when
 * it actually changes `perPage`. The same gap exists one level up: paging to
 * a different page, or a search result swapping in, changes what should be
 * measured next without changing `perPage` or necessarily any rendered size
 * either — so those are watched directly and schedule their own pass, rather
 * than waiting on a notification that may never come.
 *
 * Both refs are required: the viewport is the box to fit, the content is what
 * is being fitted. Measuring one element against itself cannot work, since a
 * `min-h-0` flex child reports the height it was given, not the height it
 * wants.
 */
export function useFittedPage<T>(
  items: ReadonlyArray<T>,
  {
    minPerPage = DEFAULT_MIN_PER_PAGE,
    maxPerPage = DEFAULT_MAX_PER_PAGE,
  }: Options = {}
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

  // Both adjustments happen during render rather than in an effect (React's
  // own "adjusting state when props change" shape): React discards this render
  // and immediately re-renders, so no frame ever paints against an
  // out-of-range slice, and there is no cascading-render effect.
  //
  // A different list is a different reading position...
  if (listLength !== items.length) {
    setListLength(items.length)
    setPage(0)
  } else if (safePage !== page) {
    // ...and a page that no longer exists (the fit grew) has to become one
    // that does.
    setPage(safePage)
  }

  // Read inside the layout effect below without being dependencies of it -
  // the effect only needs to *see* the latest `perPage`/`items`/`safePage`,
  // not to tear itself down and resubscribe its ResizeObserver whenever one
  // of them changes, which would discard the accumulated `overflowFloor`
  // along with it and undo rule 2 on every single step. A ref cannot be
  // written during render, so a dedicated, dependency-less layout effect
  // keeps it current instead - and doubles as the trigger for the "changed
  // without resizing" gap described above: a page change or an item-array
  // swap is a React-level event with no necessary DOM size change to be
  // observed, so this effect schedules a pass itself whenever either differs
  // from what it saw last render.
  const latestRef = useRef({ perPage, items, page: safePage })
  const scheduleRef = useRef<(() => void) | null>(null)
  // A one-shot permission for the next growth attempt to ignore the floor,
  // earned by the list's contents actually being swapped out. See rule 2's
  // "hidden candidate" note below for why a floor alone cannot see that, and
  // why a *page* change deliberately does not earn one.
  const retryFloorRef = useRef(false)
  // Set immediately before `settle` calls `setPerPage`, so the effect below
  // can tell this hook's own convergence renders apart from a caller's.
  const settlingRef = useRef(false)
  useLayoutEffect(() => {
    const previous = latestRef.current
    latestRef.current = { perPage, items, page: safePage }
    const isOwnConvergenceStep = settlingRef.current
    settlingRef.current = false
    if (previous.items !== items) {
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

    // The smallest count any page has been measured to overflow at, for the
    // box geometry recorded alongside it. See rule 2 above: this is a
    // property of the list, not of whichever page happened to prove it, and
    // it is what makes probing terminate.
    let overflowFloor = Number.POSITIVE_INFINITY
    let measuredAt: { available: number; width: number } | null = null
    // What the previous pass saw, so that content changing height *on its
    // own* - same page, same count, different pixels - can be told apart
    // from this hook's own convergence steps, which change `perPage` and are
    // therefore expected to change the height.
    let lastPass: { perPage: number; page: number; used: number } | null = null

    const settle = (): void => {
      const available = viewport.clientHeight
      const used = content.scrollHeight
      if (available === 0) return

      const width = viewport.clientWidth

      // A box of a different size is a different question, and every answer
      // learned about the old one is void. This is the *only* thing that
      // clears the floor from inside a pass - a list of a different length
      // tears this whole effect down and rebuilds it, which clears it too.
      if (measuredAt?.available !== available || measuredAt.width !== width) {
        measuredAt = { available, width }
        overflowFloor = Number.POSITIVE_INFINITY
      }

      // Consumed regardless of which branch below runs: a one-shot grant is
      // spent on the very next attempt whether or not it turns out to need it.
      const retryFloor = retryFloorRef.current
      retryFloorRef.current = false
      if (retryFloor) overflowFloor = Number.POSITIVE_INFINITY

      // The other half of that grant, for content whose height is driven by
      // state kept entirely outside `items` - a badge on a card, say, that
      // changes what wraps. Nothing about the input or the page moved, so
      // neither the floor's own numbers nor an identity check can see it;
      // the rendered height changing while this hook held `perPage` and the
      // page still is the measurement that can.
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

      const current = latestRef.current.perPage
      const currentPage = latestRef.current.page
      let settled = current

      if (used > available && current > minPerPage) {
        // Rule 1, and the only place rule 2's floor is ever learned: this
        // count demonstrably does not fit, so nothing may propose it again
        // until the box changes size.
        overflowFloor = Math.min(overflowFloor, current)
        settled = clamp(current - 1)
      } else if (used <= available) {
        // Rule 3: spare space on a partial page is the list running out, not
        // room for another item per page. Only a page that is actually full
        // can testify that the box has room to spare.
        const isFullPage = currentPage * current + current <= items.length
        const hasMoreToShow = current < items.length
        const proposed = current + 1

        if (
          isFullPage &&
          hasMoreToShow &&
          proposed < overflowFloor &&
          proposed <= maxPerPage
        ) {
          settled = clamp(proposed)
        }
      }

      setIsMeasuring(false)

      // Only reschedule on an actual change, and do it unconditionally
      // (rather than trusting the ResizeObserver below to notice): the DOM
      // does not necessarily resize between two convergence steps - e.g.
      // adding a card into a grid row no taller than the row already was -
      // and a step that changes nothing has nothing left to converge toward.
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

    // Exposed so the "did the page or item array change" effect above can
    // request a pass too - it fires on events this effect has no dependency
    // on (see its own comment), so it cannot call `schedule` directly.
    scheduleRef.current = schedule
    schedule()

    // Absent in jsdom and on the server. Without it the fit is measured once
    // on mount and simply never revised, which degrades to a static page size
    // rather than throwing - the wrong number of rows is a far smaller
    // problem than a component that cannot render at all.
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
