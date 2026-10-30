import type { TimedWord } from "@burn-ins/lib/captions/timing"
import type { HasText, Measure } from "@burn-ins/lib/lines"
import { rowText } from "@burn-ins/lib/text"

/** A timed word, for building captions by hand. */
export const word = (
  text: string,
  startMs: number,
  endMs: number
): TimedWord => ({ text, startMs, endMs })

/** Characters a run of words takes on one line, spaces between words included. */
export const charsOf = (words: ReadonlyArray<HasText>): number =>
  rowText(words).length

/** Lines `limit` characters wide, for breaking by hand-counted lengths. */
export const byChars = (limit: number): Measure => ({ widthOf: charsOf, limit })
