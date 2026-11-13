import type { SpokenToken } from "./words"

const MS_PER_MINUTE = 60_000

/** From the first word's start to the last word's end; 0 with no words. */
export function spokenMs(spoken: ReadonlyArray<SpokenToken>): number {
  const first = spoken.at(0)
  if (first === undefined) return 0
  const lastEnd = Math.max(...spoken.map((word) => word.endMs))
  return lastEnd - first.startMs
}

/** How many per minute of `ms`; null when no time passed. */
export function perMinute(count: number, ms: number): number | null {
  return ms > 0 ? (count * MS_PER_MINUTE) / ms : null
}

/**
 * The silence after each spoken word before the next one began, in order:
 * `gaps[k]` is the gap after word `k`. Words that overlap leave no gap.
 */
export function gapsBetween(spoken: ReadonlyArray<SpokenToken>): Array<number> {
  const gaps: Array<number> = []
  let reached: number | null = null
  for (const word of spoken) {
    if (reached !== null) gaps.push(Math.max(0, word.startMs - reached))
    reached = Math.max(reached ?? word.endMs, word.endMs)
  }
  return gaps
}
