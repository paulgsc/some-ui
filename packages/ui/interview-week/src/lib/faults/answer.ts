import { z } from "zod"

import { ANSWER_PAUSE_MS, MUMBLE_P } from "./thresholds"
import {
  Count,
  gapsBetween,
  lastEndMs,
  longest,
  Ms,
  perMinute,
  Rate,
  spokenMs,
  wpm,
} from "./timing"
import {
  fillerCount,
  HeardWordsSchema,
  spokenTokens,
  type HeardWord,
} from "./words"

export const AnswerTakeSchema = z.object({
  words: HeardWordsSchema,
  /** The question's target length, in milliseconds. */
  targetMs: z.int().positive(),
  /** The take's whole length, when the recording gives it. */
  takeMs: z.int().nonnegative().nullable(),
})
// Written out, not inferred, so a caller may pass a readonly array.
export type AnswerTake = {
  words: ReadonlyArray<HeardWord>
  targetMs: number
  takeMs: number | null
}

/** The measured faults of an interview answer. */
export const AnswerFaultsSchema = z.object({
  /** Every word heard, fillers included, as `spokenTokens` counts them. */
  words: Count,
  /**
   * Words from the closed list (`fillers.json`), one per heard word ("Mm-hmm"
   * is one), and how many a minute.
   */
  fillers: z.object({ count: Count, perMinute: Rate.nullable() }),
  /**
   * Gaps between words at or over `ANSWER_PAUSE_MS`, and the longest gap
   * between words whatever its length. The silence before the first word and
   * after the last is counted apart, never as a pause; the trailing silence
   * needs the take's length.
   */
  pauses: z.object({
    count: Count,
    longestMs: Ms.nullable(),
    leadingMs: Ms.nullable(),
    trailingMs: Ms.nullable(),
  }),
  /**
   * Words heard with `p` under `MUMBLE_P`, and their share of the words that
   * carry a `p` (null when none does).
   */
  mumbled: z.object({
    count: Count,
    share: z.number().min(0).max(1).nullable(),
  }),
  /** Words a minute of spoken time, fillers aside. */
  pace: z.object({ wpm: Rate.nullable() }),
  /** Spoken time (first word to last) against the question's target. */
  length: z.object({
    spokenMs: Ms,
    targetMs: z.int().positive(),
    over: z.boolean(),
    overMs: Ms,
  }),
})
export type AnswerFaults = z.infer<typeof AnswerFaultsSchema>

/** The measured faults of one interview take; throws on one the schema refuses. */
export function measureAnswer(input: AnswerTake): AnswerFaults {
  const take = AnswerTakeSchema.parse(input)
  const spoken = spokenTokens(take.words)
  const spokenTime = spokenMs(spoken)
  const gaps = gapsBetween(spoken)
  const fillers = fillerCount(spoken)
  const sure = spoken.filter((word) => word.p !== undefined)
  const mumbled = sure.filter((word) => (word.p ?? 1) < MUMBLE_P).length
  const first = spoken.at(0)
  const lastEnd = lastEndMs(spoken)
  const overMs = Math.max(0, spokenTime - take.targetMs)
  return {
    words: spoken.length,
    fillers: { count: fillers, perMinute: perMinute(fillers, spokenTime) },
    pauses: {
      count: gaps.filter((gap) => gap >= ANSWER_PAUSE_MS).length,
      longestMs: longest(gaps),
      leadingMs: first?.startMs ?? null,
      trailingMs:
        lastEnd === null || take.takeMs === null
          ? null
          : Math.max(0, take.takeMs - lastEnd),
    },
    mumbled: {
      count: mumbled,
      share: sure.length === 0 ? null : mumbled / sure.length,
    },
    pace: { wpm: wpm(spoken) },
    length: {
      spokenMs: spokenTime,
      targetMs: take.targetMs,
      over: overMs > 0,
      overMs,
    },
  }
}
