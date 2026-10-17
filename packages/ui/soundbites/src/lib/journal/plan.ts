/**
 * An open primer on the phone and the takes recorded for it, and the
 * arithmetic over them: where each cut sits on the episode's timeline, how
 * long a take may run, and what re-opening a primer would let go of.
 *
 * Targets are soft and the budget is hard. A take may run past its cut's
 * target (the timeline shows the overrun), but never past what the budget
 * leaves once every other cut's take is counted: one take per cut, so a redo
 * gives its own take's time back.
 *
 * An episode is a draft on its way to Drive, not an archive: the phone keeps
 * one, and lets it go once shared, discarded, replaced by another primer, or
 * left `JOURNAL_IDLE_MS` without a take.
 */
import { SOUNDBITE_MIN_MS } from "@soundbites/lib/policy"

import type { Cut, Primer } from "./primer"
import { CUT_TARGET_MIN_MS } from "./primer"

export type JournalPlan = {
  readonly primer: Primer
  /** Targets the person moved, by cut id; any other cut keeps the primer's. */
  readonly targets: Readonly<Record<string, number>>
  /**
   * ISO 8601, UTC: when the primer was opened. It names the episode, so a
   * share that finishes after another primer opened lets go of nothing of it.
   */
  readonly openedAt: string
  /**
   * ISO 8601, UTC: when the primer was opened or a take last kept. The
   * episode is let go `JOURNAL_IDLE_MS` after it.
   */
  readonly touchedAt: string
}

/** The one take kept for a cut. Its audio is stored beside it by `cutId`. */
export type JournalTake = {
  readonly cutId: string
  /** ISO 8601, UTC. */
  readonly recordedAt: string
  readonly durationMs: number
  readonly mimeType: string
}

/** How long an episode waits on its next take before it is let go. */
export const JOURNAL_IDLE_MS = 7 * 86_400_000

/** When `plan` is let go unless a take is kept first, in epoch ms. */
export function expiresAt(plan: JournalPlan): number {
  return Date.parse(plan.touchedAt) + JOURNAL_IDLE_MS
}

/** One tap on a cut's minus or plus. */
export const NUDGE_MS = 5_000

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

/** A take under way: it stands in for its cut's kept take until it lands. */
export type LiveTake = { readonly cutId: string; readonly elapsed: number }

type TimelineRow = {
  readonly cut: Cut
  /** From 0, in the primer's order. */
  readonly index: number
  /** Where the cut begins: the sum of the targets before it. */
  readonly startMs: number
  readonly targetMs: number
  readonly take: JournalTake | null
  /** The live take's length while one runs here, else the kept take's. */
  readonly takenMs: number | null
  readonly live: boolean
}

export type Timeline = {
  readonly rows: ReadonlyArray<TimelineRow>
  /** The targets' sum: how long the episode is planned to run. */
  readonly plannedMs: number
  /** The takes' sum, a live one in place of its cut's: the budget spent. */
  readonly recordedMs: number
  readonly budgetMs: number
  /** What the full width of a bar stands for: the budget, or the plan if longer. */
  readonly scaleMs: number
}

export function timeline(
  plan: JournalPlan,
  takes: ReadonlyArray<JournalTake>,
  live: LiveTake | null = null
): Timeline {
  let startMs = 0
  let recordedMs = 0
  const rows = plan.primer.cuts.map((cut, index): TimelineRow => {
    const targetMs = targetOf(plan, cut)
    const take = takes.find((each) => each.cutId === cut.id) ?? null
    const isLive = live?.cutId === cut.id
    const takenMs = isLive ? live.elapsed : (take?.durationMs ?? null)
    const row = { cut, index, startMs, targetMs, take, takenMs, live: isLive }
    startMs += targetMs
    recordedMs += takenMs ?? 0
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

/** Whether a take capped at `capMs` would be too short to keep. */
export function isSpent(capMs: number): boolean {
  return capMs < SOUNDBITE_MIN_MS
}

/**
 * `takes` that belong to `plan`'s cuts, in its order. A take for a cut the
 * plan lacks (one a dropped write left behind) is neither shown nor sent.
 */
export function inCutOrder(
  plan: JournalPlan,
  takes: ReadonlyArray<JournalTake>
): Array<JournalTake> {
  const order = plan.primer.cuts.map((cut) => cut.id)
  return takes
    .filter((take) => order.includes(take.cutId))
    .sort((a, b) => order.indexOf(a.cutId) - order.indexOf(b.cutId))
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
