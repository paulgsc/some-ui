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
 * the viewport's and steps `perPage` one item toward the fit, which converges
 * in a couple of frames and — importantly — cannot oscillate, because it only
 * ever grows while there is measured room to spare.
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

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return undefined

    let frame = 0

    const settle = (): void => {
      const available = viewport.clientHeight
      const used = content.scrollHeight
      if (available === 0) return

      setPerPage((current) => {
        const clamp = (value: number): number =>
          Math.min(maxPerPage, Math.max(minPerPage, value))

        // Overflowing: give back one item and try again next frame.
        if (used > available && current > minPerPage) {
          return clamp(current - 1)
        }

        // Room to spare and more items waiting: take one more. The estimate
        // uses the current page's average row height, which is only used to
        // decide *whether* another row could fit - the next pass re-measures
        // and gives it back if the guess was optimistic.
        const rowHeight = current > 0 ? used / current : used
        const roomLeft = available - used
        if (
          used <= available &&
          rowHeight > 0 &&
          roomLeft >= rowHeight &&
          current < items.length
        ) {
          return clamp(current + 1)
        }

        return current
      })

      setIsMeasuring(false)
    }

    const schedule = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(settle)
    }

    schedule()

    // Absent in jsdom and on the server. Without it the fit is measured once
    // on mount and simply never revised, which degrades to a static page size
    // rather than throwing - the wrong number of rows is a far smaller
    // problem than a component that cannot render at all.
    if (typeof ResizeObserver === "undefined") {
      return (): void => cancelAnimationFrame(frame)
    }

    const observer = new ResizeObserver(schedule)
    observer.observe(viewport)
    observer.observe(content)

    return (): void => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [items.length, minPerPage, maxPerPage, perPage])

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

  const start = safePage * perPage
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
