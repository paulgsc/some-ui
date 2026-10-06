/**
 * When a session starts winding down, read off the orchestrator's clock: no
 * state of its own, so there is nothing to keep in step or go stale. The
 * session is winding down for its last `leadMs`; "+5 min" (`EXTEND_MS`, the
 * orchestrator's `Extend`) moves the end, and with it the window.
 */

const MINUTE_MS = 60_000

/** How much "+5 min" adds. */
export const EXTEND_MS = 5 * MINUTE_MS

/** The last two minutes, or the last quarter of a session shorter than eight. */
export function leadMs(totalMs: number): number {
  return Math.min(2 * MINUTE_MS, totalMs / 4)
}

export function isWindingDown(remainingMs: number, totalMs: number): boolean {
  return totalMs > 0 && remainingMs <= leadMs(totalMs)
}

/** `m:ss`, for the countdown. */
export function formatRemaining(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}
