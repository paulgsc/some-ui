import type { KeyboardEvent } from "react"
import { useMemo, useState } from "react"
import type { ActivityDefinition } from "@some-ui/activity-catalog"
import { searchActivities } from "@some-ui/activity-catalog"

/**
 * The fields the handler actually reads.
 *
 * Narrower than `React.KeyboardEvent` on purpose: a handler that only needs
 * `key` and `preventDefault` should say so, and a test then drives it with
 * those two rather than constructing a synthetic event to exercise plumbing
 * that is not under test. It stays assignable to `onKeyDown` either way.
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
   * Pass the *ranked* catalogue. Equally good text matches come back in the
   * order they arrived, so recommendation order becomes the tie-break for
   * free and the two rankings compose instead of competing.
   */
  catalogue: ReadonlyArray<ActivityDefinition>
  onLaunch: (activity: ActivityDefinition) => void
}

/**
 * The keyboard half of the search overlay, kept out of the component so it
 * can be tested without a router, a query client or a DOM (#855).
 *
 * "Fully operable by keyboard" is an acceptance criterion, and an acceptance
 * criterion that can only be checked by mounting the whole dashboard is one
 * that quietly stops being checked.
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
  // Clamped rather than reset on every result change: the index only has to
  // be *valid*, and snapping to the top mid-typing moves the selection out
  // from under someone who is still narrowing.
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
      // overlay is the thing in the way, and dismissing it is what the key
      // is for here.
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
