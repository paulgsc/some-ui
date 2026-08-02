import { useCallback, useRef } from "react"

/**
 * Inter-keystroke intervals, recorded on the host side.
 *
 * # Why here and not in the engine
 *
 * The engine keeps a *bounded* keystroke window — twelve timestamps, because
 * that is all the instantaneous figure ever reads (see
 * `crates/leetype_wasm/src/leetype/stats.rs`). Widening it so the host could
 * ask for the whole distribution afterwards would grow engine state for a
 * consumer the engine does not have.
 *
 * The calibration run is the one consumer that wants every interval: the
 * baseline store takes a *trimmed mean* and an *interquartile range*, and
 * neither can be recovered from totals. A run's mean interval, repeated, has
 * a dispersion of exactly zero — which would tell the deadband that every
 * player is a metronome.
 *
 * So the warm-up records intervals where the keystrokes already pass through
 * React, and throws them away afterwards. Nothing else in the package uses
 * this.
 */
export type KeystrokeIntervals = {
  /** Wrap the engine's `press` so each keystroke is timed on the way past. */
  record: () => void
  /** Every interval so far, in milliseconds, oldest first. */
  read: () => Array<number>
  reset: () => void
}

export function useKeystrokeIntervals(): KeystrokeIntervals {
  const intervalsRef = useRef<Array<number>>([])
  const lastRef = useRef<number | null>(null)

  const record = useCallback((): void => {
    const now = Date.now()
    const last = lastRef.current
    lastRef.current = now
    // The first keystroke has no interval before it — the gap between "the
    // passage appeared" and "they started" is reading time, not typing speed.
    if (last !== null) {
      intervalsRef.current.push(now - last)
    }
  }, [])

  const read = useCallback((): Array<number> => [...intervalsRef.current], [])

  const reset = useCallback((): void => {
    intervalsRef.current = []
    lastRef.current = null
  }, [])

  return { record, read, reset }
}
