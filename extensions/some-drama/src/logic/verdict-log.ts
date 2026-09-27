// ── Verdict log ───────────────────────────────────────────────────────────────
// The pure half of the longitudinal record of rating and likelihood to finish.
// background.ts owns storage and calls logVerdict(); the card calls
// verdictTrend() to draw how each verdict moved across episodes. No DOM, no
// browser globals (logic/ layer).
//
// Grammar:
//   change  one move of one verdict — from → to, at an episode and video time
//   fold    further changes of the same verdict, drama and episode within
//           FOLD_WINDOW_MS extend the latest change instead of adding one
//   trend   a verdict's value at the end of each stretch of changes made in
//           one episode, in log order (the drama as it was watched)

import type { VerdictField, VerdictRecord } from "@drama/types"

/** Changes of the same verdict closer together than this are one change. */
export const FOLD_WINDOW_MS = 10_000

/** Oldest changes are dropped past this many (Charter §8: bounded storage). */
export const MAX_VERDICTS = 2_000

export type VerdictInput = Omit<VerdictRecord, "from"> & {
  from: number | null
}

export type VerdictLogResult = {
  verdicts: Array<VerdictRecord>
  // The record that now stands for this change, or null when folding brought
  // the verdict back where it started and the change was dropped.
  verdict: VerdictRecord | null
}

/**
 * Append a change to the log. Pressing "rating up" four times in a row is one
 * change from 7 to 9, anchored at the first press's video time; stepping back
 * to where it started leaves no change at all. A change to the value it
 * already had is not logged.
 */
export function logVerdict(
  verdicts: ReadonlyArray<VerdictRecord>,
  input: VerdictInput
): VerdictLogResult {
  const last = verdicts.at(-1)
  const folds =
    last?.dramaId === input.dramaId &&
    last.field === input.field &&
    last.episode === input.episode &&
    input.at - last.at >= 0 &&
    input.at - last.at <= FOLD_WINDOW_MS

  if (folds) {
    const earlier = verdicts.slice(0, -1)
    if (last.from === input.to) return { verdicts: earlier, verdict: null }
    const verdict: VerdictRecord = { ...last, to: input.to, at: input.at }
    return { verdicts: [...earlier, verdict], verdict }
  }

  if (input.from === input.to) return { verdicts: [...verdicts], verdict: null }
  const verdict: VerdictRecord = { ...input }
  return { verdicts: [...verdicts, verdict].slice(-MAX_VERDICTS), verdict }
}

/** A drama's changes, oldest first. */
export function dramaVerdicts(
  verdicts: ReadonlyArray<VerdictRecord>,
  dramaId: string
): Array<VerdictRecord> {
  return verdicts.filter((v) => v.dramaId === dramaId)
}

export type TrendPoint = { episode: string; value: number }

/**
 * One verdict's value at the end of each stretch of changes made in one
 * episode, in log order, from one drama's changes (see dramaVerdicts). The first point is where the verdict started (the
 * earliest change's `from`, when it had one), labelled with that episode.
 */
export function verdictTrend(
  verdicts: ReadonlyArray<VerdictRecord>,
  field: VerdictField
): Array<TrendPoint> {
  const changes = verdicts.filter((v) => v.field === field)
  const runs: Array<TrendPoint> = []
  for (const v of changes) {
    const tail = runs.at(-1)
    if (tail?.episode === v.episode) tail.value = v.to
    else runs.push({ episode: v.episode, value: v.to })
  }
  const first = changes[0]
  return first && first.from !== null
    ? [{ episode: first.episode, value: first.from }, ...runs]
    : runs
}

/**
 * An SVG path through a trend: x spread evenly over `width`, y the value's
 * place in [0, max] over `height` (top is max). Empty for fewer than 2 points.
 */
export function trendPath(
  points: ReadonlyArray<TrendPoint>,
  max: number,
  width: number,
  height: number
): string {
  if (points.length < 2) return ""
  const step = width / (points.length - 1)
  return points
    .map((p, i) => {
      const x = Math.round(i * step * 10) / 10
      const y =
        Math.round(
          (1 - Math.min(max, Math.max(0, p.value)) / max) * height * 10
        ) / 10
      return `${i === 0 ? "M" : "L"}${x},${y}`
    })
    .join(" ")
}
