/**
 * From timed words to captions: each spoken line's words, grouped into the
 * captions shown one after another.
 *
 * A caption starts at its first word and, within its line, takes the next
 * word unless that word comes after a pause longer than `pauseMs`, would make
 * the caption last longer than `maxCaptionMs`, or would no longer fit in two
 * lines. A caption never spans two spoken lines. It stays up `lingerMs` past
 * its last word, and never past the next caption's start.
 *
 * Words are taken in the order given; each line's words are expected in time
 * order, and lines in time order.
 */

import { breakLines } from "@burn-ins/lib/lines"

import { lineCharsFor } from "./layout"
import type { CaptionTheme } from "./theme"

export type TimedWord = {
  readonly text: string
  readonly startMs: number
  readonly endMs: number
}

/** One of the speaker's lines: a sentence or phrase said in one go. */
export type SpokenLine = { readonly words: ReadonlyArray<TimedWord> }

export type Caption = {
  readonly startMs: number
  readonly endMs: number
  /** One or two lines of words, as they are drawn. */
  readonly rows: ReadonlyArray<ReadonlyArray<TimedWord>>
}

export type GroupingRules = {
  readonly pauseMs: number
  readonly maxCaptionMs: number
  readonly lingerMs: number
}

const GROUPING: GroupingRules = {
  pauseMs: 450,
  maxCaptionMs: 3200,
  lingerMs: 500,
}

const MAX_ROWS = 2

export function groupCaptions(
  lines: ReadonlyArray<SpokenLine>,
  lineChars: number,
  rules: GroupingRules = GROUPING
): ReadonlyArray<Caption> {
  const groups: Array<ReadonlyArray<TimedWord>> = []
  for (const line of lines) {
    let group: Array<TimedWord> = []
    for (const word of line.words) {
      const first = group[0]
      const last = group.at(-1)
      if (
        first !== undefined &&
        last !== undefined &&
        (word.startMs - last.endMs > rules.pauseMs ||
          word.endMs - first.startMs > rules.maxCaptionMs ||
          breakLines([...group, word], lineChars).length > MAX_ROWS)
      ) {
        groups.push(group)
        group = []
      }
      group.push(word)
    }
    if (group.length > 0) groups.push(group)
  }
  return groups.flatMap((words, i) => {
    const first = words[0]
    const last = words.at(-1)
    if (first === undefined || last === undefined) return []
    const next = groups[i + 1]?.[0]
    const linger = last.endMs + rules.lingerMs
    return [
      {
        startMs: first.startMs,
        endMs: next === undefined ? linger : Math.min(linger, next.startMs),
        rows: breakLines(words, lineChars),
      },
    ]
  })
}

/** The captions for spoken lines, as drawn in a theme. */
export const captionsFor = (
  lines: ReadonlyArray<SpokenLine>,
  theme: CaptionTheme
): ReadonlyArray<Caption> => groupCaptions(lines, lineCharsFor(theme))

/** When the last caption leaves the screen; 0 for none. */
export const runtimeOf = (captions: ReadonlyArray<Caption>): number =>
  captions.at(-1)?.endMs ?? 0
