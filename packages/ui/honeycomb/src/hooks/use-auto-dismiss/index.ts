import { useEffect, useRef, useState } from "react"

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
  const onElapsedRef = useRef(onElapsed)
  const [wasActive, setWasActive] = useState(active)
  // Per-activation id, so "already fired" latches per run: a re-render before
  // teardown must not fire twice, but the next run must. Written only in an
  // effect.
  const [runId, setRunId] = useState(0)
  const firedRunRef = useRef<number | null>(null)

  useEffect(() => {
    onElapsedRef.current = onElapsed
  }, [onElapsed])

  // Reset elapsed time during render when `active` flips: an effect would
  // let one paint through with the old value, enough on a fast re-activation
  // to fire the callback instantly.

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
