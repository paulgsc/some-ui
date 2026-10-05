/**
 * Fires the presence lease on arriving at a session, on every return to
 * visible, and on a sparse renewal between, never on a timer that runs in a
 * hidden tab.
 *
 * 45s renewal against the server's 75s TTL leaves ~30s of slack for a
 * throttled timer and jitter. The renewal timer lives only while the tab is
 * visible, so a hidden tab asserts no presence.
 */

import { useEffect } from "react"

import { reportPresence } from "./presence"

/**
 * Fixed: no route exposes the server's `NUDGE_PRESENCE_LEASE_TTL_SECONDS`.
 * A TTL configured at or below this interval leaves no slack, a server
 * misconfiguration this timer cannot compensate for.
 */
const RENEWAL_INTERVAL_MS = 45_000

/** `contextKey` is undefined while there is no session in view (e.g. the
 * no-session dashboard state) — that state writes no lease at all. */
export function usePresenceLease(contextKey: string | undefined): void {
  useEffect(() => {
    if (!contextKey) return undefined
    if (typeof document === "undefined") return undefined

    let intervalId: ReturnType<typeof setInterval> | undefined

    const stopRenewal = (): void => {
      if (intervalId === undefined) return
      clearInterval(intervalId)
      intervalId = undefined
    }

    const assertPresence = (): void => {
      void reportPresence(contextKey)
    }

    const onVisibilityChange = (): void => {
      if (document.visibilityState !== "visible") {
        stopRenewal()
        return
      }
      assertPresence()
      intervalId ??= setInterval(assertPresence, RENEWAL_INTERVAL_MS)
    }

    onVisibilityChange()
    document.addEventListener("visibilitychange", onVisibilityChange)

    return (): void => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
      stopRenewal()
    }
  }, [contextKey])
}
