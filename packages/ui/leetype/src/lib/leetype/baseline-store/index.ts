import { z } from "zod"

/**
 * The player's own typing speed, sampled and stored.
 *
 * # Why this exists at all
 *
 * `ADAPTIVE_WPM_THRESHOLD = 40` measured nothing about a 90 WPM typist.
 * Every threshold in the reveal loop and the gate is now a *fraction* of the
 * numbers in this file (see `crates/leetype_wasm/src/leetype/reveal.rs`),
 * because WPM is being used as a proxy for **retrieval fluency** — the gap
 * between typing text you have to recall and text you are merely copying —
 * and that gap is only readable against a player's own copying speed.
 *
 * # Ephemeral by design
 *
 * `localStorage`, no account, no server, no cross-device sync. Clearing it
 * costs the player one warm-up and nothing else: there is no history here
 * worth mourning, no score, and no unlock. That is a deliberate property,
 * not an unfinished feature — it is what lets the whole store be thrown away
 * on any schema change without a migration.
 *
 * # The nuisance-vs-competence line (LTY-SEAM S2, #1016)
 *
 * `STORAGE_KEY` below is, as of this milestone, the *only* `localStorage`
 * key `packages/ui/leetype` writes — checked by grepping `src/` for
 * `localStorage.setItem`/`getItem`/`removeItem` outside test fixtures. That
 * is not an accident worth losing the next time someone reaches for
 * `localStorage` in this workspace, so the rule that makes it true is
 * written down here, where a future key would be added:
 *
 * A key belongs in `localStorage` only if it is a **nuisance parameter** —
 * something that calibrates how a session is *presented* (a rendering or
 * timing instrument), never something that constitutes a **competence
 * claim** — a record of what the learner knows, has completed, or has
 * earned. `Baseline` is the former: it is a copying-speed sample the reveal
 * loop divides its own thresholds by, exactly the register
 * `adaptive-learning-canon.typ` Proposition 9.1 calls a nuisance parameter
 * for the renderer. It is deliberately unbounded-history-free (only ever
 * one blended sample, never a log) and deliberately disposable.
 *
 * The test for a *new* key, before it is written: would losing it change
 * anything about what a session is scored, gated, or credited on for
 * anyone other than this one calibration instrument? If yes, it is a
 * competence claim, and this workspace has nowhere to put one —
 * `adaptive-learning-canon.typ`'s O3 (a real belief envelope) is where a
 * competence claim belongs, and it does not exist yet (Cor. 4.3: this
 * surface is uncredited by declaration). A `localStorage` key is never the
 * fallback for "O3 isn't built yet."
 */

/** One player's sampled typing speed. */
export type Baseline = {
  /**
   * Copying speed, in WPM. A **trimmed mean over inter-keystroke
   * intervals**, not a mean over the whole run.
   *
   * The choice matters and the two answers differ. A whole-run mean is a
   * *throughput* figure: it charges the player for the one time they stopped
   * to look at the ceiling. But a hesitation is precisely the event the
   * reveal loop exists to detect, so folding it into the baseline would
   * calibrate the detector against the thing it is detecting. The baseline
   * has to describe how fast this person types *while typing*, so the tails
   * are trimmed away before the mean is taken.
   */
  wpm: number
  /**
   * Spread of the same sample, in WPM — the interquartile range, converted.
   *
   * Carried because the deadband wants a *scale*, not just a centre: a
   * metronome and an erratic typist with the same mean deserve different
   * bands, and only this number can tell the engine which one it has.
   * Robust rather than a standard deviation, for the same reason the mean is
   * trimmed.
   */
  dispersion: number
  /** How many runs have contributed to it. `0` means nothing has. */
  samples: number
  updatedAt: number
}

/**
 * Reused from the XP economy this replaced. One ephemeral store beats
 * standing up a second, and the old contents are simply not this shape — a
 * v1 payload fails the check below and reads as "not calibrated", which
 * costs exactly one warm-up.
 */
const STORAGE_KEY = "leetyping_progress"

/** Bumped whenever [`Baseline`] changes shape. Old payloads are discarded. */
const SCHEMA_VERSION = 2

/**
 * How many typeable characters a calibration run samples.
 *
 * Expressed in characters rather than seconds so every player gives the same
 * *amount of evidence*: 120 characters is roughly 35 seconds at 40 WPM and
 * 16 at 90, which is the same sample and two very different sits.
 */
export const CALIBRATION_CHARS = 120

/**
 * What a player who has never calibrated gets.
 *
 * Not a policy threshold — a stand-in for a measurement that has not
 * happened yet, and transient by construction: the first real run feeds
 * [`blendBaseline`] and starts moving it toward the truth. A player must
 * always be able to play; refusing to start until they have warmed up would
 * be a menu in front of the loop, which is the thing this whole milestone
 * removed.
 */
export const COLD_START_BASELINE: Baseline = {
  wpm: 40,
  dispersion: 12,
  samples: 0,
  updatedAt: 0,
}

/**
 * How fast a new sample moves the stored baseline.
 *
 * People get faster, and a baseline that never moves would slowly turn back
 * into a magic number. Continuous update was chosen over a decay schedule or
 * a periodic re-sample because it needs no calendar and no prompt: every run
 * is a sample, and the baseline follows the player. At `0.2` a new speed is
 * about two-thirds arrived at after five runs and nine-tenths after ten —
 * fast enough to track real improvement, slow enough that one bad morning
 * does not recalibrate the game.
 */
const LEARNING_RATE = 0.2

/** Fraction trimmed from each tail before the mean is taken. */
const TRIM_FRACTION = 0.1

/** Fewer intervals than this is noise, not a sample. */
const MIN_INTERVALS = 12

/**
 * The stored shape, validated rather than trusted.
 *
 * `localStorage` is host-supplied data in exactly the sense a fetched corpus
 * is: another tab, an older build, or a person with the devtools open can
 * have put anything there. Validating at the seam is the same posture the
 * engine's projections already get.
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
 * The stored baseline, or `null` when there is none.
 *
 * Missing, unparseable, wrong-version and structurally-wrong payloads all
 * take the same branch, silently. Storage is not a source of truth worth
 * defending: the cost of getting it wrong is one warm-up, and the cost of
 * throwing here is a player who cannot start.
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
    // Quota exceeded, or storage disabled entirely (private browsing, a
    // hardened profile). The player is a cold start forever in that case,
    // which is playable.
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
 * Turn a run's inter-keystroke intervals into a baseline sample.
 *
 * Returns `null` for a run too short to say anything — a two-keystroke
 * "sample" would move the stored baseline as hard as a real one, and the
 * whole point of the trim is that outliers do not get a vote.
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
    // The IQR read as a WPM spread: the speed at the fast quartile minus the
    // speed at the slow one, which is the width the deadband actually cares
    // about.
    dispersion: Math.abs(
      wpmFromInterval(quantile(sorted, 0.25)) -
        wpmFromInterval(quantile(sorted, 0.75))
    ),
    samples: 1,
    updatedAt: Date.now(),
  }
}

/**
 * Fold a fresh sample into the stored baseline.
 *
 * A player with no stored baseline takes the sample outright — the cold
 * start is a stand-in, not evidence, and averaging a measurement with a
 * guess is worse than either.
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

/** Linear-interpolated quantile of an already-sorted array. */
function quantile(sorted: ReadonlyArray<number>, fraction: number): number {
  if (sorted.length === 0) return 0
  const position = (sorted.length - 1) * fraction
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  const low = sorted[lower] ?? 0
  const high = sorted[upper] ?? low
  return low + (high - low) * (position - lower)
}
