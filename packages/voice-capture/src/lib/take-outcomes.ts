/**
 * Every take's outcome, from whichever screen recorded it (CK2, #2381): how
 * it ended, how long the microphone took to open, how long it ran and how
 * loud it got. The two runtimes (`takeKit`, `takePattern`) report each
 * ending here as their step records it, so no screen has to; the app
 * installs where outcomes go once, at boot (`setTakeOutcomes`), as it
 * installs the storage budget (`./room`).
 *
 * Nothing of what was said: no audio, no words, no item content (the
 * owner's C3, #2369). `answers` is the screen's id for its item, so it is
 * left out too.
 *
 * Without an installed sink nothing is reported: the web builds' tests, and
 * this package's.
 */
import type { TakeEnded, TakeKitState } from "./take-kit"

export type TakeOutcome = {
  /** The screen, as its ports name it (`TakeKitPorts.screen`). */
  readonly screen: string
  readonly ended: TakeEnded
  /** Milliseconds since the epoch; null when the start carried no time. */
  readonly startedAt: number | null
  readonly readyMs: number | null
  readonly durationMs: number | null
  /** The loudest measured level, 0 to 1; null when nothing was measured. */
  readonly peak: number | null
}

type TakeOutcomes = (outcome: TakeOutcome) => void

let sink: TakeOutcomes | null = null

/** Where every take's outcome goes from now on; null for nowhere. */
export function setTakeOutcomes(next: TakeOutcomes | null): void {
  sink = next
}

/** The outcome `after` records, when its step ended a take `before` had not. */
function takeOutcomeOf(
  screen: string,
  before: TakeKitState,
  after: TakeKitState
): TakeOutcome | null {
  const { ended } = after
  if (ended === null || ended === before.ended) return null
  return {
    screen,
    ended,
    startedAt: after.startedAt,
    readyMs: after.readyMs,
    durationMs: after.durationMs,
    peak: after.peak,
  }
}

/**
 * Hands the take `after` ended to the sink. A sink that throws is skipped:
 * a take's ending is the screen's, and never waits on its report.
 */
export function reportTakeEnded(
  screen: string,
  before: TakeKitState,
  after: TakeKitState
): void {
  if (sink === null) return
  const outcome = takeOutcomeOf(screen, before, after)
  if (outcome === null) return
  try {
    sink(outcome)
  } catch {
    // Ignored: the outcome is lost, the take is not.
  }
}
