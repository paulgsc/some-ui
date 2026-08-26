/**
 * Fires the presence lease at the moments the server-side redesign was
 * sized for: once on arriving at a session, again on every
 * `visibilitychange` back to visible, and on a sparse renewal in between —
 * never on a timer that runs regardless of tab state.
 *
 * 45s renewal against a 75s server-side TTL leaves ~30s of slack for a
 * throttled `setInterval` in a backgrounded tab and for network jitter; that
 * slack is the whole budget, not room for a shorter interval. The renewal
 * timer is only ever alive while the tab is visible — it starts on mount (if
 * already visible) or on the next visible transition, and is torn down the
 * instant the tab hides or this unmounts, which is what keeps a hidden tab
 * from asserting presence nobody has.
 */

import { useEffect } from "react"

import { reportPresence } from "./presence"

/**
 * Fixed, not derived from the server's `NUDGE_PRESENCE_LEASE_TTL_SECONDS` —
 * there is no route that exposes it to the client, and inventing one for
 * this alone would be server-side scope this change doesn't otherwise need.
 * The two are meant to move together: a deployment that configures a TTL at
 * or below this interval (default is 75s) leaves no slack for a renewal to
 * land before the previous lease expires, which is a server misconfiguration
 * relative to this client, not something this timer can compensate for.
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
