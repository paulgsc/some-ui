import { useEffect, useRef, useState } from "react"

const TICK_MS = 100

type UseAutoDismissOptions = {
  /** While false the countdown doesn't exist - no ticking, no elapsed time kept. */
  active: boolean
  /** How long the countdown runs, in milliseconds of *unpaused* time. */
  durationMs: number
  /**
   * Freezes the countdown where it stands without discarding it. Meant for
   * "the reader is engaged" - hovering, focused inside - so a player who
   * leans in to actually read never gets the panel yanked out from under
   * them, and one who doesn't isn't made to click through it.
   */
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
 * Elapsed time is accumulated tick by tick rather than measured against a
 * start timestamp: a pause has to actually stop the clock, and wall-clock
 * arithmetic would silently count the paused interval. The cost is TICK_MS
 * granularity, which is invisible on a progress bar and irrelevant to a
 * multi-second timeout.
 */
export function useAutoDismiss({
  active,
  durationMs,
  paused,
  onElapsed,
}: UseAutoDismissOptions): UseAutoDismissResult {
  const [elapsedMs, setElapsedMs] = useState(0)
  const onElapsedRef = useRef(onElapsed)
  const [wasActive, setWasActive] = useState(active)
  // Each activation gets its own id, so "already fired" can be latched per
  // run: a re-render between the final tick and the caller tearing the panel
  // down must not fire the callback a second time, but the *next* run must
  // still be able to fire. Only ever written from inside an effect.
  const [runId, setRunId] = useState(0)
  const firedRunRef = useRef<number | null>(null)

  useEffect(() => {
    onElapsedRef.current = onElapsed
  }, [onElapsed])

  // Discard the previous run's elapsed time the moment `active` flips, during
  // render rather than in an effect (React's own "adjusting state when props
  // change" shape): React throws this render away and immediately re-renders,
  // so a stale countdown is never committed and there is no cascading-render
  // effect. An effect here would let one paint through with the old value -
  // long enough, on a fast re-activation, to fire the callback instantly.
  if (wasActive !== active) {
    setWasActive(active)
    setElapsedMs(0)
    setRunId((id) => id + 1)
  }

  useEffect((): (() => void) | undefined => {
    if (!active || paused) return undefined

    const id = setInterval(() => {
      setElapsedMs((prev) => prev + TICK_MS)
    }, TICK_MS)
    return () => clearInterval(id)
  }, [active, paused])

  useEffect(() => {
    if (!active || elapsedMs < durationMs) return
    if (firedRunRef.current === runId) return
    firedRunRef.current = runId
    onElapsedRef.current()
  }, [active, elapsedMs, durationMs, runId])

  const remainingMs = Math.max(0, durationMs - elapsedMs)

  return {
    remainingMs,
    progress: durationMs <= 0 ? 1 : Math.min(1, elapsedMs / durationMs),
  }
}
