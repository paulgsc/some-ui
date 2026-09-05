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
 * The fit is found by trying and correcting rather than by arithmetic on a
 * measured row height: rows here are not uniform (a two-line label is taller
 * than a one-line one), so dividing by an average silently overflows on the
 * pages with the tall rows. Each pass compares the content's real height to
 * the viewport's and steps `perPage` one item toward the fit.
 *
 * Growing is a guess, not a measurement — "is there room for one more" is
 * answered from the *shown* rows' average height, because the row being
 * considered hasn't rendered yet. That guess can be wrong in one specific,
 * recurring way: a short row (or the empty page) makes the average look
 * small, the next row is much taller, and the page overflows the moment it
 * renders. Giving that item back the next frame is correct, but the rows
 * still shown are exactly as short as before, so the very same guess fires
 * again — and forever, once nothing about the input is going to change. A
 * `ceiling` remembers the last growth attempt a real measurement rejected -
 * but keyed on what was actually *measured*, not on any signal for "did the
 * content change" inferred from the caller's React state. Two attempts at
 * that inference were each wrong in a different, real direction: keying on
 * the item array's identity reads every render as new content for a caller
 * that (like `PromptPanel`, right in this tree) rebuilds its rows each
 * render without memoizing, defeating the guard permanently; keying on the
 * viewport/page instead misses a genuine content change that never touches
 * either, such as a badge disappearing and un-wrapping a row. Neither
 * failure is reachable if the ceiling never asks "did the input change" at
 * all - only "does this exact growth attempt (this proposed count, at this
 * box height and width, starting from content that measured to exactly this
 * many pixels) still overflow the way it did last time." Those numbers come
 * straight off the DOM, so whether the caller memoizes anything is
 * irrelevant, and any real change to what is rendered - a shorter search
 * result, an unwrapped row, a resized box - shows up as a genuinely
 * different number rather than a same/different verdict on a proxy for one.
 *
 * Reaching the fit can take several of these passes in a row (grow, measure,
 * grow again), and nothing about the DOM necessarily changes size between two
 * of them - adding a card into a grid row that was already exactly that tall
 * changes what is rendered without changing `content`'s own height, so the
 * `ResizeObserver` below reports nothing. Each pass therefore explicitly
 * requests the next one itself when it actually changes `perPage`. The same
 * gap exists one level up: paging to a different page, or a search result
 * swapping in, changes what *should* be measured next without changing
 * `perPage` or necessarily any rendered size either - so those are watched
 * directly (by reference, by page index) and schedule their own pass too,
 * rather than waiting on an observer that may never fire.
 *
 * A plain reschedule is not always enough, though: a same-length swap can
 * leave the *shown* rows measuring identically while changing a row that is
 * not shown yet - `[100, 150]` becoming `[100, 50]` after 2 was rejected
 * still measures 100 for the one row on screen, so the ceiling's numbers
 * still match and block the retry even though the hidden candidate is now
 * short enough to fit. The measured baseline genuinely cannot see a
 * candidate that has not rendered - only trying will. So an items/page
 * change earns the very next attempt a one-shot bypass of the ceiling, not
 * just a wake-up call: if it overflows again, a fresh ceiling is set
 * immediately from that real measurement, no worse off than before.
 *
 * That bypass has to be earned, not automatic, or it reopens the first
 * problem from the other direction: this hook's own `setPerPage` is exactly
 * the kind of update that makes an *unmemoized* caller (`PromptPanel`, again)
 * hand back a new `items` reference on every single settle-driven re-render,
 * which would spend the bypass every pass and disable the ceiling just as
 * permanently as keying it on identity did. The distinction that holds is
 * *who* caused the render: `settlingRef` marks the render `settle` itself
 * triggers, and only an items/page change on a render that was *not* one of
 * those - a prop from outside, or `goToPage`/`next`/`previous`, which are
 * this hook's own public API for "show something else" rather than its
 * internal convergence loop - earns the bypass.
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
  // of them changes (see the doc comment on why that recreation was itself a
  // bug). A ref cannot be written during render (refs are for effects and
  // event handlers, not render, and the lint rule for it is not negotiable
  // here) - so a dedicated, dependency-less layout effect keeps it current
  // instead, and doubles as the trigger for the "changed without resizing"
  // gap the doc comment above describes: a page change or an item-array swap
  // is a React-level event with no necessary DOM size change to be observed,
  // so this effect schedules a pass itself whenever either differs from what
  // it saw last render, rather than waiting on a notification that may never
  // come.
  const latestRef = useRef({ perPage, items, page: safePage })
  const scheduleRef = useRef<(() => void) | null>(null)
  const bypassCeilingRef = useRef(false)
  // Set immediately before `settle` calls `setPerPage`, so the effect below
  // can tell its own convergence-driven renders apart from everything else -
  // see the doc comment on why that distinction, not just "did items or the
  // page change", is what decides whether to bypass the ceiling.
  const settlingRef = useRef(false)
  useLayoutEffect(() => {
    const previous = latestRef.current
    latestRef.current = { perPage, items, page: safePage }
    const isOwnConvergenceStep = settlingRef.current
    settlingRef.current = false
    if (
      !isOwnConvergenceStep &&
      (previous.items !== items || previous.page !== safePage)
    ) {
      bypassCeilingRef.current = true
      scheduleRef.current?.()
    }
  })

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return undefined

    let frame = 0

    // A growth attempt this pass is *about* to confirm or refute: the count
    // it would grow to, the box it was measured against, and the content
    // height that estimate was based on. Set the moment growth is proposed;
    // read back on the very next pass, when the same numbers say whether
    // that specific attempt is the one now overflowing.
    type PendingGrowth = {
      proposedCount: number
      available: number
      width: number
      priorUsed: number
    }
    let pendingGrowth: PendingGrowth | null = null

    // The last growth attempt a real measurement rejected, purely in terms
    // of what was measured - see the doc comment above for why this is
    // deliberately not "what changed" in the caller's items or page.
    type Ceiling = {
      count: number
      available: number
      width: number
      baselineUsed: number
    }
    let ceiling: Ceiling | null = null

    const settle = (): void => {
      const available = viewport.clientHeight
      const used = content.scrollHeight
      if (available === 0) return

      const width = viewport.clientWidth
      const clamp = (value: number): number =>
        Math.min(maxPerPage, Math.max(minPerPage, value))

      // Consumed here regardless of which branch below actually runs: a
      // one-shot grant earned by a real items/page change, spent on the
      // very next attempt whether or not that attempt turns out to need it.
      const bypassCeiling = bypassCeilingRef.current
      bypassCeilingRef.current = false

      const current = latestRef.current.perPage
      let settled = current

      // Overflowing: give back one item. If this is the growth attempt
      // `pendingGrowth` was tracking, its own numbers - not this pass's,
      // which already reflect the too-tall result - are what the ceiling
      // needs: the content height growth looked safe *from*, not the height
      // that proved it wrong.
      if (used > available && current > minPerPage) {
        settled = clamp(current - 1)
        if (
          pendingGrowth !== null &&
          pendingGrowth.proposedCount === current &&
          pendingGrowth.available === available &&
          pendingGrowth.width === width
        ) {
          ceiling = {
            count: current,
            available,
            width,
            baselineUsed: pendingGrowth.priorUsed,
          }
        }
      } else {
        // Room to spare and more items waiting: take one more, unless this
        // exact attempt - this proposed count, from content that measured to
        // exactly this many pixels, in a box this size - already proved
        // overflowing. The estimate uses the current page's average row
        // height, which is only used to decide *whether* another row could
        // fit - the next pass re-measures and gives it back if the guess was
        // optimistic.
        const rowHeight = current > 0 ? used / current : used
        const roomLeft = available - used
        const proposed = current + 1
        const knownToOverflow =
          !bypassCeiling &&
          ceiling !== null &&
          ceiling.count === proposed &&
          ceiling.available === available &&
          ceiling.width === width &&
          ceiling.baselineUsed === used

        if (
          used <= available &&
          rowHeight > 0 &&
          roomLeft >= rowHeight &&
          current < items.length &&
          !knownToOverflow
        ) {
          settled = clamp(proposed)
          pendingGrowth = {
            proposedCount: settled,
            available,
            width,
            priorUsed: used,
          }
        } else {
          pendingGrowth = null
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

    // Not `[…, perPage]` in the deps below: `settle` now reschedules itself
    // on every change it makes (see above), so this observer only has to
    // catch resizes this hook did not itself cause - and recreating it on
    // every `perPage` change discarded `ceiling` along with it, undoing the
    // guard above on every single step.
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
