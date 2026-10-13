import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react"

type SessionDeadline = {
  /** Whether the current term has run out. For handlers, not render. */
  hasExpired: () => boolean
  /** Start a fresh term of `durationMs` from now. */
  restart: () => void
}

/**
 * A session's term: `onExpire` runs once, `durationMs` after mount or the
 * last `restart`.
 *
 * Anchored at mount, not at the player's first action: the orchestrator
 * removes the scene at `start_time + duration` from when it became active
 * (`buildActiveLifetimes`), so a later anchor could expire after the scene
 * was already unmounted. One timer to the deadline, not a ticking clock:
 * nothing renders the time left, so nothing re-renders while it runs.
 */
export function useSessionDeadline(
  durationMs: number,
  onExpire: () => void
): SessionDeadline {
  const [generation, setGeneration] = useState(0)
  const expiredRef = useRef(false)
  const expire = useEffectEvent(onExpire)

  useEffect(() => {
    expiredRef.current = false
    const timer = window.setTimeout(() => {
      expiredRef.current = true
      expire()
    }, durationMs)
    return (): void => window.clearTimeout(timer)
  }, [durationMs, generation])

  const hasExpired = useCallback((): boolean => expiredRef.current, [])
  const restart = useCallback((): void => {
    setGeneration((current) => current + 1)
  }, [])

  return { hasExpired, restart }
}
