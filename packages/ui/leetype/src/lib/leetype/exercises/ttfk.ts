/**
 * Time-to-first-keystroke, as an authoring audit (LTY-SEAM S4, #1018).
 *
 * # The question this answers
 *
 * Not "is this learner slow" — "does this authored instance block before
 * the engine receives input?" A step whose evidence must be *understood*
 * before typing can begin looks fine on the page and is measurably
 * different in play, and that is the one item on the authoring checklist a
 * human reviewer cannot reliably eyeball.
 *
 * # Why per instance, never per learner (Axiom 3.1)
 *
 * `adaptive-learning-canon.typ` Axiom 3.1: a pause is reading, deciding,
 * being interrupted, or being stumped, and nothing in the channel
 * separates them. Per learner that identifies nothing. Per *instance*,
 * aggregated across sessions, the confound averages into the baseline and
 * the outlier is the signal — a different, much weaker statistical claim,
 * which is why it holds. Nothing exported here accepts or produces a
 * learner identifier; there is no field for one to attach to.
 *
 * # Standardized against the learner's own baseline (Prop. 9.1)
 *
 * `baseline-store` is reused, not paralleled: {@link standardizeTtfk} takes
 * a `Baseline.wpm` as a plain number rather than standing up a second
 * latency baseline, expressing TTFK in units of "characters of typing time
 * at this player's own copying speed" — the same units
 * `crates/leetype_wasm/src/leetype/reveal.rs`'s `INITIAL_DELAY_CHARS`
 * already uses for the same reason: a fixed millisecond figure means
 * nothing without a speed to divide it by.
 *
 * # The reveal-window interaction (the part likely to get silently wrong)
 *
 * `RevealConfig::initial_delay_ms(attempt)` opens the reveal window after
 * a delay, and the engine keeps ticking that delay forward on a timer
 * (`docs/leetype/README.md`'s `Command::Tick`) independently of whether
 * the player has typed anything yet. On a slow step the window can
 * therefore open *before* the first keystroke — at which point TTFK would
 * measure how long the system waited, not how long the player took to
 * respond. {@link computeTtfk} censors that case explicitly rather than
 * silently: an observation whose `revealKAtFirstKeystroke` is nonzero
 * (`Snapshot.revealK`, read at the instant of the first keystroke, before
 * that keystroke could itself have changed it) is marked `censored`, never
 * averaged into an instance's aggregate. Silently including it would
 * produce a metric that looks cleanest exactly on the slow instances it is
 * supposed to catch, which is worse than not having it.
 *
 * # Explicitly not
 *
 * Not persisted (LTY-SEAM S2, #1016) — every function here is pure, and
 * nothing in this module touches `localStorage`. Not shown to the learner,
 * not scored, not credited — nothing exported carries a learner identifier
 * for a score to attach to in the first place. Not a routing input:
 * `routing.ts`'s `routeObligation` reads exactly
 * `Pick<Snapshot, "attempt" | "assisted">` and its own excess-property
 * check rejects anything else, including a TTFK-shaped value —
 * `ttfk.test.ts` pins this with a `@ts-expect-error`, the same proof
 * `routing.test.ts` already leans on for "reads nothing else."
 *
 * # The seam
 *
 * Nothing here is exported from `./index.ts`, and nothing in `./index.ts`
 * imports this file — the same posture `obligation-graph.ts` takes for the
 * identical reason: this module has no telemetry source to run against in
 * CI (there are no real keystroke timings in a statically authored
 * corpus), so it is exercised only by its own tests against synthetic
 * observations. {@link flagOutliers} returns the same `Array<string>`
 * violation-message shape `corpus-lint.ts`'s `lintCorpus` does, ready to be
 * unioned into it the day a real observation pipeline exists to feed it.
 * Wiring one up is a decision for whoever builds that pipeline, not a
 * consequence of this module existing.
 */

/** How many typeable characters make up one word, for the WPM conversion — the same convention `reveal.rs` and `stats.rs` use. */
const CHARS_PER_WORD = 5

/**
 * One player's time-to-first-keystroke on one step, in the raw units a
 * capture point would produce. No learner identifier — aggregation below
 * is keyed by `stepId` alone, on purpose (Axiom 3.1).
 */
export type TtfkObservation = {
  /** Which authored step this was measured on — the unit of analysis. */
  stepId: string
  /** Wall-clock milliseconds from the step becoming visible to the first accepted keystroke. */
  ttfkMs: number
  /** The player's sampled copying speed (`Baseline.wpm`) at the time of this observation. */
  baselineWpm: number
  /**
   * `Snapshot.revealK` read at the instant of the first keystroke, before
   * that keystroke could itself have moved it. Nonzero means the reveal
   * window had already opened on its own — see the module doc's "reveal-
   * window interaction" section.
   */
  revealKAtFirstKeystroke: number
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
 * Raw TTFK, expressed as a multiple of how long this player's own baseline
 * takes to type one character — comparable across players of different
 * speeds, which a raw millisecond figure is not.
 */
export function standardizeTtfk(ttfkMs: number, baselineWpm: number): number {
  const perChar = msPerBaselineChar(baselineWpm)
  return perChar > 0 ? ttfkMs / perChar : 0
}

/**
 * One observation, standardized — or censored, if the reveal window opened
 * before the player's first keystroke could have (see the module doc).
 */
export function computeTtfk(observation: TtfkObservation): TtfkResult {
  if (observation.revealKAtFirstKeystroke > 0) {
    return {
      censored: true,
      reason:
        "the reveal window had already opened before the first keystroke — this observation measures how long the engine waited, not how long the player took to respond",
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

/** Linear-interpolated quantile of an already-sorted array — mirrors `baseline-store/calibration.ts`'s own, over a different quantity. */
function quantile(sorted: ReadonlyArray<number>, fraction: number): number {
  if (sorted.length === 0) return 0
  const position = (sorted.length - 1) * fraction
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  const low = sorted[lower] ?? 0
  const high = sorted[upper] ?? low
  return low + (high - low) * (position - lower)
}

function median(values: ReadonlyArray<number>): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return quantile(sorted, 0.5)
}

/**
 * Every observation, folded per `stepId` — the unit of analysis Axiom 3.1
 * requires. Deterministic order (`stepId`, ascending) so a report's diff is
 * stable across runs, the same discipline `corpus-lint.ts` holds itself to.
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
      medianStandardized: median(bucket.standardized),
      sampleCount: bucket.standardized.length,
      censoredCount: bucket.censoredCount,
    }))
    .sort((a, b) => a.stepId.localeCompare(b.stepId))
}

/**
 * How many interquartile ranges above the corpus's own third quartile an
 * instance's median has to sit before it is flagged — the conventional
 * Tukey outlier fence, not a number picked for this corpus. Borrowed from
 * the same robust-statistics family `baseline-store`'s own dispersion (an
 * IQR-derived spread) already draws on, so the flag and the figure it is
 * applied to share one statistical vocabulary rather than two.
 */
const OUTLIER_IQR_MULTIPLIER = 1.5

/** Below this many sampled instances, a quartile range does not mean anything — there is no distribution to be an outlier against yet. */
const MIN_INSTANCES_FOR_A_DISTRIBUTION = 4

/**
 * Instances whose standardized TTFK sits far above the corpus's own
 * distribution: *"this step is being read, not typed."* Self-calibrated
 * against the corpus's own spread rather than an absolute constant, the
 * same posture `totality.ts`'s `MAX_OBLIGATIONS_PER_ROUTE` takes citing
 * `index.test.ts`'s own established ceiling — a bound grounded in
 * something already true of the data, not picked in the abstract.
 *
 * Returns the same violation-message shape `corpus-lint.ts`'s `lintCorpus`
 * does (see the module doc's "the seam" section for why this is not itself
 * wired into `lintCorpus`).
 */
export function flagOutliers(
  aggregates: ReadonlyArray<InstanceAggregate>
): Array<string> {
  const withSamples = aggregates.filter((a) => a.sampleCount > 0)
  if (withSamples.length < MIN_INSTANCES_FOR_A_DISTRIBUTION) return []

  const sortedMedians = withSamples
    .map((a) => a.medianStandardized)
    .sort((a, b) => a - b)
  const q1 = quantile(sortedMedians, 0.25)
  const q3 = quantile(sortedMedians, 0.75)
  const fence = q3 + OUTLIER_IQR_MULTIPLIER * (q3 - q1)

  return withSamples
    .filter((a) => a.medianStandardized > fence)
    .map(
      (a) =>
        `step "${a.stepId}": standardized TTFK (${a.medianStandardized.toFixed(1)}x a baseline character) sits above the corpus's own outlier fence (${fence.toFixed(1)}x) — this step is being read, not typed.`
    )
}
