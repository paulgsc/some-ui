/**
 * Two burn-ins of one video never draw in the same region at the same
 * moment (STUDIO ST15). What a burn-in claims is read from what it draws, frame by frame
 * (`frameAt`, `boxesOf`), so a kind whose place changes over its run (the
 * authorship mark: its intro and end card in the header and body, the
 * gutter between) claims only where it is at each moment.
 */

import type { BurnInData, Prepared } from "./burn-in"
import { boxesOf, burnInName, frameAt, prepare } from "./burn-in"
import { overlaps, REGIONS } from "./geometry"

/** A burn-in placed in a video, as the renderer asks to record it. */
export type PlacedBurnIn = BurnInData & {
  /** The video's frame it starts on, and how many frames it lasts. */
  readonly startFrame: number
  readonly frames: number
}

/** The regions a burn-in draws in, `atMs` into its run. */
function regionsAt(p: Prepared, atMs: number): ReadonlySet<string> {
  const boxes = boxesOf(frameAt(p, atMs))
  return new Set(
    Object.entries(REGIONS)
      .filter(([, region]) => boxes.some((box) => overlaps(box, region)))
      .map(([name]) => name)
  )
}

/**
 * Every pair of `burnIns` that draw in one region at one frame, each said
 * once, with where and when; empty when none do. A burn-in that can't be
 * drawn at all is left to the recorder's `load`, which says why.
 */
export function clashes(
  burnIns: ReadonlyArray<PlacedBurnIn>,
  fps: number
): ReadonlyArray<string> {
  const ready = burnIns.flatMap((b) => {
    const p = prepare(b)
    return p.ok ? [{ b, p: p.value }] : []
  })
  const problems: Array<string> = []
  for (const [i, one] of ready.entries()) {
    for (const other of ready.slice(i + 1)) {
      const from = Math.max(one.b.startFrame, other.b.startFrame)
      const to = Math.min(
        one.b.startFrame + one.b.frames,
        other.b.startFrame + other.b.frames
      )
      for (let f = from; f < to; f++) {
        const mine = regionsAt(one.p, ((f - one.b.startFrame) * 1000) / fps)
        const theirs = regionsAt(
          other.p,
          ((f - other.b.startFrame) * 1000) / fps
        )
        const shared = [...mine].filter((r) => theirs.has(r))
        if (shared.length > 0) {
          problems.push(
            `${burnInName(one.b)} and ${burnInName(other.b)} both draw in the ${shared.join(" and ")} at ${(f / fps).toFixed(2)} s`
          )
          break
        }
      }
    }
  }
  return problems
}
