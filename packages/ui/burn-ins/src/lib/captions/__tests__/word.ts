import type { TimedWord } from "@burn-ins/lib/captions/timing"

/** A timed word, for building captions by hand. */
export const word = (
  text: string,
  startMs: number,
  endMs: number
): TimedWord => ({ text, startMs, endMs })
