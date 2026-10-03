/**
 * The time, to the minute, as something React can subscribe to. For a page
 * that shows "what is due now" and stays open: Home on the phone, left in
 * the background over a checkpoint or past midnight.
 *
 * Two things move it: a timer on each wall-clock minute while the page runs, and the
 * page coming back into view, since a backgrounded WebView's timers stall
 * and the first thing seen on return should already be current. Both only
 * re-read `Date.now()`; nothing here holds state of its own beyond the
 * subscription, so a missed tick costs nothing.
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
