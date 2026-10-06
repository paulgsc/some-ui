/**
 * When a session starts winding down, read off the orchestrator's clock: no
 * state of its own, so there is nothing to keep in step or go stale.
 */

const MINUTE_MS = 60_000

export const EXTEND_MS = 5 * MINUTE_MS

export function leadMs(totalMs: number): number {
  return Math.min(2 * MINUTE_MS, totalMs / 4)
}

export function isWindingDown(remainingMs: number, totalMs: number): boolean {
  return totalMs > 0 && remainingMs <= leadMs(totalMs)
}

/** Ended inside the lead (a "Wrap up" counts): complete, not cut short. */
export function finishedNaturally(elapsedMs: number, totalMs: number): boolean {
  return elapsedMs >= totalMs - leadMs(totalMs)
}
