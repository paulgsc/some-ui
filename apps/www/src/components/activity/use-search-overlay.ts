import type { KeyboardEvent } from "react"
import { useMemo, useState } from "react"
import type { ActivityDefinition } from "@some-ui/activity-catalog"
import { searchActivities } from "@some-ui/activity-catalog"

/**
 * The fields the handler reads, narrower than `React.KeyboardEvent` so a test
 * drives it with just these; still assignable to `onKeyDown`.
 */
export type OverlayKeyEvent = Pick<
  KeyboardEvent<HTMLInputElement>,
  "key" | "preventDefault"
>

export type SearchOverlay = {
  query: string
  setQuery: (next: string) => void
  /** Bounded to `m` - see SEARCH_RESULT_LIMIT. */
  results: Array<ActivityDefinition>
  /** True once there is a query, which is when the overlay is showing. */
  isOpen: boolean
  /** The row Enter would launch, if there is one. */
  active: ActivityDefinition | undefined
  activeIndex: number
  setActiveIndex: (index: number) => void
  handleKeyDown: (event: OverlayKeyEvent) => void
}

type Options = {
  /**
   * Pass the *ranked* catalogue: equal text matches keep arrival order, so
   * recommendation order is the tie-break.
   */
  catalogue: ReadonlyArray<ActivityDefinition>
  onLaunch: (activity: ActivityDefinition) => void
}

/**
 * The keyboard half of the search overlay, kept out of the component so
 * keyboard operability can be tested without a router, query client or DOM
 * (#855).
 */
export function useSearchOverlay({
  catalogue,
  onLaunch,
}: Options): SearchOverlay {
  const [query, setRawQuery] = useState("")
  const [activeIndex, setRawActiveIndex] = useState(0)

  const results = useMemo(
    () => searchActivities(catalogue, query),
    [catalogue, query]
  )

  const isOpen = query.trim().length > 0
  // Clamped, not reset on every result change: snapping to the top mid-typing
  // moves the selection from under someone still narrowing.
  const safeIndex =
    results.length === 0 ? 0 : Math.min(activeIndex, results.length - 1)
  const active = results[safeIndex]

  const setQuery = (next: string): void => {
    setRawQuery(next)
    setRawActiveIndex(0)
  }

  const handleKeyDown = (event: OverlayKeyEvent): void => {
    if (event.key === "Escape") {
      // Escape restores the recommended set rather than only blurring: the
      // overlay is what is in the way.
      setQuery("")
      return
    }
    if (!isOpen || results.length === 0) return

    if (event.key === "ArrowDown") {
      event.preventDefault()
      setRawActiveIndex((safeIndex + 1) % results.length)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setRawActiveIndex((safeIndex - 1 + results.length) % results.length)
    } else if (event.key === "Enter") {
      event.preventDefault()
      onLaunch(active)
    }
  }

  return {
    query,
    setQuery,
    results,
    isOpen,
    active,
    activeIndex: safeIndex,
    setActiveIndex: setRawActiveIndex,
    handleKeyDown,
  }
}
