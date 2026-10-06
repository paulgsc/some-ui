/**
 * The time, to the minute, as something React can subscribe to, for a page
 * left open (Home on the phone). It moves on each wall-clock minute and when
 * the page comes back into view (a backgrounded WebView's timers stall). Both
 * only re-read `Date.now()`, so a missed tick costs nothing.
 */
import { useSyncExternalStore } from "react"

const MINUTE_MS = 60_000

/** Milliseconds until the wall clock next reaches a whole minute. */
function untilNextMinute(): number {
  return MINUTE_MS - (Date.now() % MINUTE_MS)
}

/**
 * Ticks on the wall clock's minutes, not every 60 s from whenever it was
 * subscribed: subscribed at 23:59:59, it moves at 00:00:00, not 00:00:59.
 * Each tick re-aims at the next boundary, so a late timer does not drift.
 */
function subscribe(onChange: () => void): () => void {
  let timer = 0
  const tick = (): void => {
    onChange()
    timer = window.setTimeout(tick, untilNextMinute())
  }
  timer = window.setTimeout(tick, untilNextMinute())
  const onVisible = (): void => {
    if (document.visibilityState === "visible") onChange()
  }
  document.addEventListener("visibilitychange", onVisible)
  return (): void => {
    window.clearTimeout(timer)
    document.removeEventListener("visibilitychange", onVisible)
  }
}

/** Whole minutes since the epoch: equal between ticks, so React re-renders only on a new minute. */
function minuteNow(): number {
  return Math.floor(Date.now() / MINUTE_MS)
}

/** The current time, floored to the minute; re-renders the caller when it moves. */
export function useMinuteClock(): Date {
  const minute = useSyncExternalStore(subscribe, minuteNow, minuteNow)
  return new Date(minute * MINUTE_MS)
}
