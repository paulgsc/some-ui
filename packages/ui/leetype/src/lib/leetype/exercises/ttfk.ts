/**
 * Time-to-first-keystroke, as an authoring audit (LTY-SEAM S4): "does this
 * authored instance block before the engine receives input?" A step whose
 * evidence must be *understood* before typing looks fine on the page but
 * not in play.
 *
 * Per instance, never per learner (`adaptive-learning-canon.typ` Axiom 3.1):
 * a pause may be reading, deciding, interruption or being stumped. Per
 * learner that identifies nothing; per instance, aggregated, the confound
 * averages out and the outlier is the signal. Nothing here accepts or
 * produces a learner identifier.
 *
 * Standardized against the player's own `Baseline.wpm` (Prop. 9.1), in
 * "characters of typing time", the units `reveal.rs`'s `INITIAL_DELAY_CHARS`
 * uses: milliseconds mean nothing without a speed.
 *
 * # Censoring both reveal paths
 *
 * Two engine paths can show the answer before the first keystroke, and both
 * must be censored or the metric looks cleanest exactly where it should
 * flag:
 *
 * 1. The automatic reveal window (`RevealConfig::initial_delay_ms`) opens on
 *    a timer regardless of input, so `Snapshot.revealK` may already be
 *    nonzero.
 * 2. Manual reveal (`toggle_manual_override`) shows every slot while `k`
 *    keeps evolving as if it were off, so `revealK` can be `0` while the
 *    whole answer is visible.
 *
 * `computeTtfk` censors an observation with either flag set (both read
 * before the first keystroke could change them).
 *
 * Pure and unpersisted; never shown, scored or credited; not a routing input
 * (`routeObligation` reads only `Pick<Snapshot, "attempt" | "assisted">`,
 * pinned by `ttfk.test.ts`'s `@ts-expect-error`). Not exported from
 * `./index.ts`: there is no telemetry source yet. `flagOutliers` returns
 * `lintCorpus`'s violation shape, ready to be unioned in once a pipeline
 * exists.
 */

import { median, quantile } from "@some-ui/core-utils"

/** How many typeable characters make up one word, for the WPM conversion — the same convention `reveal.rs` and `stats.rs` use. */
const CHARS_PER_WORD = 5

/**
 * One player's time-to-first-keystroke on one step, in raw capture units.
 * No learner identifier: aggregation is keyed by `stepId` alone (Axiom 3.1).
 */
export type TtfkObservation = {
  /** Which authored step this was measured on — the unit of analysis. */
  stepId: string
  /** Wall-clock milliseconds from the step becoming visible to the first accepted keystroke. */
  ttfkMs: number
  /** The player's sampled copying speed (`Baseline.wpm`) at the time of this observation. */
  baselineWpm: number
  /**
   * `Snapshot.revealK` at the first keystroke, before it could move it.
   * Nonzero means the automatic reveal window had already opened.
   */
  revealKAtFirstKeystroke: number
  /**
   * `Snapshot.manualRevealActive` at the same instant: manual reveal before
   * typing, which `revealKAtFirstKeystroke` cannot see.
   */
  manualRevealActiveAtFirstKeystroke: boolean
}

/** The standardized figure, or why this observation cannot produce one. */
export type TtfkResult =
  | { censored: false; standardized: number }
  | { censored: true; reason: string }

/** Milliseconds it takes this baseline to type one character. `0` for a non-positive baseline — never divides by it. */
function msPerBaselineChar(baselineWpm: number): number {
  const charsPerMinute = baselineWpm * CHARS_PER_WORD
  return charsPerMinute > 0 ? 60_000 / charsPerMinute : 0
}

/**
 * Raw TTFK as a multiple of this player's per-character typing time, so it
 * compares across speeds.
 */
export function standardizeTtfk(ttfkMs: number, baselineWpm: number): number {
  const perChar = msPerBaselineChar(baselineWpm)
  return perChar > 0 ? ttfkMs / perChar : 0
}

/** One observation, standardized, or censored if either reveal path pre-empted it. */
export function computeTtfk(observation: TtfkObservation): TtfkResult {
  if (observation.revealKAtFirstKeystroke > 0) {
    return {
      censored: true,
      reason:
        "the automatic reveal window had already opened before the first keystroke — this observation measures how long the engine waited, not how long the player took to respond",
    }
  }
  if (observation.manualRevealActiveAtFirstKeystroke) {
    return {
      censored: true,
      reason:
        "the player had manual reveal active before the first keystroke — every slot was already visible, so this observation measures nothing about whether the step blocks",
    }
  }
  return {
    censored: false,
    standardized: standardizeTtfk(observation.ttfkMs, observation.baselineWpm),
  }
}

/** TTFK aggregated across every observation of one instance — never of one learner. */
export type InstanceAggregate = {
  stepId: string
  /** Median standardized TTFK across every uncensored observation of this step. `0` when there are none. */
  medianStandardized: number
  /** Uncensored observations this median was computed from. */
  sampleCount: number
  /** Observations excluded because the reveal window pre-empted them. */
  censoredCount: number
}

/**
 * Every observation, folded per `stepId` (Axiom 3.1), sorted by `stepId` so
 * a report's diff is stable.
 */
export function aggregateByInstance(
  observations: ReadonlyArray<{ stepId: string; result: TtfkResult }>
): ReadonlyArray<InstanceAggregate> {
  const byStep = new Map<
    string,
    { standardized: Array<number>; censoredCount: number }
  >()
  for (const { stepId, result } of observations) {
    const bucket = byStep.get(stepId) ?? {
      standardized: [],
      censoredCount: 0,
    }
    if (result.censored) {
      bucket.censoredCount += 1
    } else {
      bucket.standardized.push(result.standardized)
    }
    byStep.set(stepId, bucket)
  }

  return Array.from(byStep.entries())
    .map(([stepId, bucket]) => ({
      stepId,
      medianStandardized: median(bucket.standardized) ?? 0,
      sampleCount: bucket.standardized.length,
      censoredCount: bucket.censoredCount,
    }))
    .sort((a, b) => a.stepId.localeCompare(b.stepId))
}

/** The conventional Tukey fence: flagged above Q3 + 1.5 IQR of the corpus's medians. */
const OUTLIER_IQR_MULTIPLIER = 1.5

/** Below this many sampled instances, a quartile range does not mean anything — there is no distribution to be an outlier against yet. */
const MIN_INSTANCES_FOR_A_DISTRIBUTION = 4

/**
 * Instances whose standardized TTFK sits far above the corpus's own
 * distribution: *"this step is being read, not typed."* Self-calibrated
 * against the corpus's spread. Returns `lintCorpus`'s violation shape.
 */
export function flagOutliers(
  aggregates: ReadonlyArray<InstanceAggregate>
): Array<string> {
  const withSamples = aggregates.filter((a) => a.sampleCount > 0)
  if (withSamples.length < MIN_INSTANCES_FOR_A_DISTRIBUTION) return []

  const sortedMedians = withSamples
    .map((a) => a.medianStandardized)
    .sort((a, b) => a - b)
  const q1 = quantile(sortedMedians, 0.25) ?? 0
  const q3 = quantile(sortedMedians, 0.75) ?? 0
  const fence = q3 + OUTLIER_IQR_MULTIPLIER * (q3 - q1)

  return withSamples
    .filter((a) => a.medianStandardized > fence)
    .map(
      (a) =>
        `step "${a.stepId}": standardized TTFK (${a.medianStandardized.toFixed(1)}x a baseline character) sits above the corpus's own outlier fence (${fence.toFixed(1)}x) — this step is being read, not typed.`
    )
}
