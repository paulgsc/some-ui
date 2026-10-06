import { quantile } from "@some-ui/core-utils"
import { z } from "zod"

/**
 * The player's own typing speed, sampled and stored.
 *
 * Every reveal-loop and gate threshold is a *fraction* of these numbers
 * (`crates/leetype_wasm/src/leetype/reveal.rs`): WPM is a proxy for
 * **retrieval fluency**, the gap between recalling and copying, readable
 * only against the player's own copying speed.
 *
 * Ephemeral by design: `localStorage`, no account or sync. Clearing it costs
 * one warm-up, so the store can be discarded on any schema change.
 *
 * # The nuisance-vs-competence line (LTY-SEAM S2)
 *
 * A key belongs in `localStorage` only if it is a **nuisance parameter**
 * (calibrates how a session is *presented*), never a **competence claim**
 * (what the learner knows, completed or earned). `Baseline` is the former
 * (`adaptive-learning-canon.typ` Prop. 9.1): one blended sample, never a
 * log, disposable.
 *
 * Test for a new key: would losing it change what anyone is scored, gated
 * or credited on? Then it is a competence claim, and `localStorage` is never
 * its fallback (Cor. 4.3). The one competence record, the round ledger
 * (`lib/leetype/ledger/store`, `leetype:ledger`), is governed by its own
 * canon (§10, Rem. 10.1): versioned, bounded, validated on read, and correct
 * when evicted.
 */

/** One player's sampled typing speed. */
export type Baseline = {
  /**
   * Copying speed, in WPM: a **trimmed mean over inter-keystroke
   * intervals**, not a whole-run mean. Hesitation is what the reveal loop
   * detects, so it must not be folded into the baseline it is measured
   * against.
   */
  wpm: number
  /**
   * Spread of the same sample in WPM (the IQR, converted). The deadband needs
   * a scale: a metronome and an erratic typist with the same mean deserve
   * different bands. Robust, like the trimmed mean.
   */
  dispersion: number
  /** How many runs have contributed to it. `0` means nothing has. */
  samples: number
  updatedAt: number
}

/**
 * Reused key; an old-shape payload fails validation and reads as "not
 * calibrated", costing one warm-up.
 */
const STORAGE_KEY = "leetyping_progress"

/** Bumped whenever [`Baseline`] changes shape. Old payloads are discarded. */
const SCHEMA_VERSION = 2

/**
 * How many typeable characters a calibration run samples. Characters, not
 * seconds, so every player gives the same amount of evidence.
 */
export const CALIBRATION_CHARS = 120

/**
 * What a player who has never calibrated gets: a stand-in for a measurement,
 * replaced by the first real run (`blendBaseline`). A player can always play.
 */
export const COLD_START_BASELINE: Baseline = {
  wpm: 40,
  dispersion: 12,
  samples: 0,
  updatedAt: 0,
}

/**
 * How fast a new sample moves the stored baseline. Every run is a sample, so
 * the baseline follows the player without a schedule. At `0.2` a new speed is
 * about two-thirds arrived after five runs and nine-tenths after ten: tracks
 * improvement, ignores one bad morning.
 */
const LEARNING_RATE = 0.2

/** Fraction trimmed from each tail before the mean is taken. */
const TRIM_FRACTION = 0.1

/** Fewer intervals than this is noise, not a sample. */
const MIN_INTERVALS = 12

/**
 * The stored shape, validated rather than trusted: another tab, an older
 * build or devtools can have put anything in `localStorage`.
 */
const StoredPayloadSchema = z.object({
  version: z.literal(SCHEMA_VERSION),
  baseline: z.object({
    wpm: z.number().positive(),
    dispersion: z.number().nonnegative(),
    samples: z.number().int().nonnegative(),
    updatedAt: z.number(),
  }),
})

/**
 * The stored baseline, or `null` when there is none. Any bad payload reads
 * as `null`, silently: a wrong answer costs one warm-up, a throw costs a
 * player who cannot start.
 */
export function loadBaseline(): Baseline | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed = StoredPayloadSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data.baseline : null
  } catch {
    return null
  }
}

export function saveBaseline(baseline: Baseline): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: SCHEMA_VERSION, baseline })
    )
  } catch {
    // Quota exceeded or storage disabled: a permanent cold start is playable.
  }
}

/** Throw the sample away and warm up again. */
export function clearBaseline(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // As above: nothing to do, and nothing lost.
  }
}

/** The baseline to run the engine on, calibrated or not. */
export function effectiveBaseline(stored: Baseline | null): Baseline {
  return stored ?? COLD_START_BASELINE
}

/**
 * Turn a run's inter-keystroke intervals into a baseline sample, or `null`
 * for a run too short to count (it would move the baseline as hard as a
 * real one).
 */
export function sampleFromIntervals(
  intervalsMs: ReadonlyArray<number>
): Baseline | null {
  const usable = intervalsMs.filter(
    (interval) => Number.isFinite(interval) && interval > 0
  )
  if (usable.length < MIN_INTERVALS) return null

  const sorted = [...usable].sort((a, b) => a - b)
  const trim = Math.floor(sorted.length * TRIM_FRACTION)
  const core = sorted.slice(trim, sorted.length - trim)
  if (core.length === 0) return null

  const meanInterval =
    core.reduce((total, interval) => total + interval, 0) / core.length
  if (meanInterval <= 0) return null

  return {
    wpm: wpmFromInterval(meanInterval),
    // The IQR as a WPM spread: fast-quartile speed minus slow-quartile speed.
    dispersion: Math.abs(
      wpmFromInterval(quantile(sorted, 0.25) ?? 0) -
        wpmFromInterval(quantile(sorted, 0.75) ?? 0)
    ),
    samples: 1,
    updatedAt: Date.now(),
  }
}

/**
 * Fold a fresh sample into the stored baseline. With none stored the sample
 * is taken outright: the cold start is a guess, not evidence.
 */
export function blendBaseline(
  stored: Baseline | null,
  sample: Baseline
): Baseline {
  if (stored === null || stored.samples === 0) {
    return { ...sample, samples: 1 }
  }

  return {
    wpm: mix(stored.wpm, sample.wpm),
    dispersion: mix(stored.dispersion, sample.dispersion),
    samples: stored.samples + 1,
    updatedAt: sample.updatedAt,
  }
}

function mix(previous: number, next: number): number {
  return previous * (1 - LEARNING_RATE) + next * LEARNING_RATE
}

/** WPM implied by a mean inter-keystroke interval, on the 5-chars-a-word basis. */
function wpmFromInterval(intervalMs: number): number {
  if (intervalMs <= 0) return 0
  return 60_000 / intervalMs / 5
}
