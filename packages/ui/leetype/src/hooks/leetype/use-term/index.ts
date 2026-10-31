import {
  useEffect,
  useEffectEvent,
  useState,
  useSyncExternalStore,
} from "react"
import type { TermPorts } from "@leetype/lib/leetype/term"
import { Term } from "@leetype/lib/leetype/term"
import type { ActivityHost } from "@some-ui/react-hooks"
import { useHostHold } from "@some-ui/react-hooks"

export type UseTermOptions = {
  durationMs: number
  /** Runs once each time the term runs out. */
  onExpire?: () => void
  /** The session around it: the term waits while it waits. */
  host?: ActivityHost
  /**
   * Under which key the host keeps what was spent, so the player reopened
   * on this scene goes on with what was left. Absent, a mount starts afresh.
   */
  place?: string
  /** Test seam: the clock and the timer. */
  ports?: TermPorts
}

export type UseTerm = Pick<Term, "left" | "hasExpired" | "restart">

const spentIn = (place: unknown): number =>
  typeof place === "number" && Number.isFinite(place) && place > 0 ? place : 0

/**
 * Wiring only: a `Term` made once per mount (`lib/leetype/term`), held and
 * released with the host (`useHostHold`), its spent time kept with the host
 * whenever it is held and as it unmounts, and `onExpire` run as it runs
 * out. One timer to the deadline, not a ticking clock: nothing renders the
 * time left, so nothing re-renders while it runs.
 */
export function useTerm({
  durationMs,
  onExpire,
  host,
  place,
  ports,
}: UseTermOptions): UseTerm {
  const [term] = useState(
    () =>
      new Term(
        durationMs,
        place === undefined ? 0 : spentIn(host?.recall(place)),
        ports
      )
  )
  const keep = (): void => {
    if (place !== undefined) host?.keep(place, term.spent())
  }
  // `useHostHold` calls the target through its own Effect Events, so `hold`
  // already sees this render's host and place; the unmount needs its own.
  const keepAsUnmounted = useEffectEvent(keep)
  useHostHold(host, {
    hold: () => {
      term.hold()
      keep()
    },
    release: term.release,
  })
  useEffect(
    () => (): void => {
      term.hold()
      keepAsUnmounted()
    },
    [term]
  )
  useEffect(() => term.setDuration(durationMs), [term, durationMs])
  const expired = useSyncExternalStore(
    term.subscribe,
    term.hasExpired,
    term.hasExpired
  )
  const expire = useEffectEvent((): void => onExpire?.())
  useEffect(() => {
    if (expired) expire()
  }, [expired])
  return term
}
