import { useEffect, useEffectEvent, useState } from "react"

const TICK_MS = 100

type UseAutoDismissOptions = {
  /** While false the countdown doesn't exist - no ticking, no elapsed time kept. */
  active: boolean
  /** How long the countdown runs, in milliseconds of *unpaused* time. */
  durationMs: number
  /** Freezes the countdown without discarding it, while the reader is engaged. */
  paused: boolean
  /** Called once, when the unpaused time runs out. */
  onElapsed: () => void
}

type UseAutoDismissResult = {
  /** Unpaused milliseconds left; `durationMs` before the first tick. */
  remainingMs: number
  /** How far the countdown has run, 0 → 1. Drives the progress bar. */
  progress: number
}

/**
 * A pausable countdown that fires once and reports its own progress, for a
 * panel that dismisses itself unless the player is reading it.
 *
 * Elapsed time is accumulated per tick, not measured from a start timestamp,
 * so a pause actually stops the clock (at TICK_MS granularity).
 */
export function useAutoDismiss({
  active,
  durationMs,
  paused,
  onElapsed,
}: UseAutoDismissOptions): UseAutoDismissResult {
  const [elapsedMs, setElapsedMs] = useState(0)
  const [wasActive, setWasActive] = useState(active)

  // Reset elapsed time during render when `active` flips: an effect would
  // let one paint through with the old value.
  if (wasActive !== active) {
    setWasActive(active)
    setElapsedMs(0)
  }

  // One tick of the run's clock; null once it has fired. Reads `paused`,
  // `durationMs` and `onElapsed` as they are now without restarting the run.
  const tick = useEffectEvent((elapsed: number): number | null => {
    if (paused) return elapsed
    const next = elapsed + TICK_MS
    setElapsedMs(next)
    if (next < durationMs) return next
    onElapsed()
    return null
  })

  useEffect((): (() => void) | undefined => {
    if (!active) return undefined

    let elapsed = 0
    const id = setInterval(() => {
      const next = tick(elapsed)
      if (next === null) clearInterval(id)
      else elapsed = next
    }, TICK_MS)
    return () => clearInterval(id)
  }, [active])

  const remainingMs = Math.max(0, durationMs - elapsedMs)

  return {
    remainingMs,
    progress: durationMs <= 0 ? 1 : Math.min(1, elapsedMs / durationMs),
  }
}
