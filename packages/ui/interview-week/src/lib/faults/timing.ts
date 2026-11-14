import { z } from "zod"

import type { SpokenToken } from "./words"

export const Count = z.int().nonnegative()
export const Ms = z.int().nonnegative()
export const Rate = z.number().nonnegative()

const MS_PER_MINUTE = 60_000

/** When the last word ended; null with no words. */
export function lastEndMs(spoken: ReadonlyArray<SpokenToken>): number | null {
  return longest(spoken.map((word) => word.endMs))
}

/** From the first word's start to the last word's end; 0 with no words. */
export function spokenMs(spoken: ReadonlyArray<SpokenToken>): number {
  const first = spoken.at(0)
  return first === undefined ? 0 : (lastEndMs(spoken) ?? 0) - first.startMs
}

/** Words a minute of spoken time, fillers aside; null when no time passed. */
export function wpm(spoken: ReadonlyArray<SpokenToken>): number | null {
  return perMinute(
    spoken.filter((word) => !word.filler).length,
    spokenMs(spoken)
  )
}

/** The largest value; null with none. */
export function longest(values: ReadonlyArray<number>): number | null {
  return values.reduce<number | null>(
    (most, value) => (most === null ? value : Math.max(most, value)),
    null
  )
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
