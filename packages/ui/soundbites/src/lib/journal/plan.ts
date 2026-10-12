/**
 * An open primer on the phone and the takes recorded for it, and the
 * arithmetic over them: where each cut sits on the episode's timeline, how
 * long a take may run, and what re-opening a primer would let go of.
 *
 * Targets are soft and the budget is hard. A take may run past its cut's
 * target (the timeline shows the overrun), but never past what the budget
 * leaves once every other cut's take is counted: one take per cut, so a redo
 * gives its own take's time back.
 */
import { SOUNDBITE_BITS_PER_SECOND } from "@soundbites/lib/policy"

import type { Cut, Primer } from "./primer"
import { CUT_TARGET_MIN_MS, JOURNAL_BUDGET_MAX_MS } from "./primer"

export type JournalPlan = {
  readonly primer: Primer
  /** Targets the person moved, by cut id; any other cut keeps the primer's. */
  readonly targets: Readonly<Record<string, number>>
  /** ISO 8601, UTC. */
  readonly openedAt: string
}

/** The one take kept for a cut. Its audio is stored beside it by `cutId`. */
export type JournalTake = {
  readonly cutId: string
  /** ISO 8601, UTC. */
  readonly recordedAt: string
  readonly durationMs: number
  readonly mimeType: string
  readonly bytes: number
}

/** One tap on a cut's minus or plus. */
export const NUDGE_MS = 5_000

/**
 * The most take audio the phone keeps: twice a full budget at the target
 * bitrate, since the recorder's rate is a target, not a promise.
 */
export const JOURNAL_TAKES_MAX_BYTES =
  2 * (JOURNAL_BUDGET_MAX_MS / 1_000) * (SOUNDBITE_BITS_PER_SECOND / 8)

export function targetOf(plan: JournalPlan, cut: Cut): number {
  return plan.targets[cut.id] ?? cut.targetMs
}

/** `targets` with `cutId`'s moved by `deltaMs`, kept within its bounds. */
export function nudged(
  plan: JournalPlan,
  cutId: string,
  deltaMs: number
): Readonly<Record<string, number>> {
  const cut = plan.primer.cuts.find((each) => each.id === cutId)
  if (cut === undefined) return plan.targets
  const moved = Math.min(
    plan.primer.budgetMs,
    Math.max(CUT_TARGET_MIN_MS, targetOf(plan, cut) + deltaMs)
  )
  return { ...plan.targets, [cutId]: moved }
}

export type TimelineRow = {
  readonly cut: Cut
  /** From 0, in the primer's order. */
  readonly index: number
  /** Where the cut begins: the sum of the targets before it. */
  readonly startMs: number
  readonly targetMs: number
  readonly take: JournalTake | null
}

export type Timeline = {
  readonly rows: ReadonlyArray<TimelineRow>
  /** The targets' sum: how long the episode is planned to run. */
  readonly plannedMs: number
  /** The takes' sum: how much of the budget is spent. */
  readonly recordedMs: number
  readonly budgetMs: number
  /** What the full width of a bar stands for: the budget, or the plan if longer. */
  readonly scaleMs: number
}

export function timeline(
  plan: JournalPlan,
  takes: ReadonlyArray<JournalTake>
): Timeline {
  let startMs = 0
  let recordedMs = 0
  const rows = plan.primer.cuts.map((cut, index): TimelineRow => {
    const targetMs = targetOf(plan, cut)
    const take = takes.find((each) => each.cutId === cut.id) ?? null
    const row = { cut, index, startMs, targetMs, take }
    startMs += targetMs
    recordedMs += take?.durationMs ?? 0
    return row
  })
  const { budgetMs } = plan.primer
  return {
    rows,
    plannedMs: startMs,
    recordedMs,
    budgetMs,
    scaleMs: Math.max(budgetMs, startMs),
  }
}

/**
 * How long a take for `cutId` may run: the budget less every other cut's
 * take. Its own take does not count, since a new one replaces it.
 */
export function capFor(
  plan: JournalPlan,
  takes: ReadonlyArray<JournalTake>,
  cutId: string
): number {
  const spent = takes
    .filter(
      (take) =>
        take.cutId !== cutId &&
        plan.primer.cuts.some((cut) => cut.id === take.cutId)
    )
    .reduce((sum, take) => sum + take.durationMs, 0)
  return Math.max(0, plan.primer.budgetMs - spent)
}

/**
 * The cut ids whose takes `primer` would let go of: those it has no cut for.
 * A revised primer keeps every take whose cut kept its id.
 */
export function droppedBy(
  primer: Primer,
  takes: ReadonlyArray<JournalTake>
): Array<string> {
  return takes
    .map((take) => take.cutId)
    .filter((id) => !primer.cuts.some((cut) => cut.id === id))
}
