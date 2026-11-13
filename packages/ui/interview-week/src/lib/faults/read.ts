import { z } from "zod"

import { MIN_PHRASE_WORDS, READ_PAUSE_MS, REPEAT_WINDOW } from "./thresholds"
import { gapsBetween, perMinute, spokenMs } from "./timing"
import {
  HeardWordsSchema,
  spokenTokens,
  tokens,
  type HeardWord,
  type SpokenToken,
} from "./words"

/**
 * The most words either side of a read may hold: a 2-minute read is a few
 * hundred, and the alignment's cost is the product of the two sides.
 */
const READ_WORDS_MAX = 2000

/** One teleprompter take to measure: its words and the card's script. */
export const ReadTakeSchema = z
  .object({
    words: HeardWordsSchema.refine((words) => words.length <= READ_WORDS_MAX),
    script: z.string(),
  })
  .refine((take) => tokens(take.script).length <= READ_WORDS_MAX, {
    message: "the script is longer than a read",
  })
export type ReadTake = { words: ReadonlyArray<HeardWord>; script: string }

const Count = z.int().nonnegative()
const Ms = z.int().nonnegative()
const Rate = z.number().nonnegative()

/** The measured faults of a teleprompter read, against its script. */
export const ReadFaultsSchema = z.object({
  /** Every word heard, fillers included. */
  words: Count,
  /** The script's words, and its breaks (punctuation, line ends) between them. */
  script: z.object({ words: Count, breaks: Count }),
  /**
   * The read against the script, word by word: script words never said, said
   * as another word, and words the reader added. An added word is `repeated`
   * when it says again a word spoken within `REPEAT_WINDOW` of it, and
   * `inserted` otherwise; fillers are inserted, and also counted apart.
   */
  misread: z.object({
    skipped: Count,
    substituted: Count,
    repeated: Count,
    inserted: Count,
    fillers: Count,
  }),
  /**
   * Gaps between words at or over `READ_PAUSE_MS`: at a break of the script
   * (phrasing) or inside a phrase (a stumble), and the longest stumble.
   */
  pauses: z.object({
    atBreak: Count,
    midPhrase: Count,
    longestMidPhraseMs: Ms.nullable(),
  }),
  /**
   * Words a minute of spoken time, fillers aside; how many phrases (the words
   * between two breaks) were long enough to time; and how much their pace
   * varied (standard deviation over mean, null under two phrases). A low
   * variation is an even, unvarying pace.
   */
  pace: z.object({
    wpm: Rate.nullable(),
    phrases: Count,
    variation: Rate.nullable(),
  }),
  /** From the cue (the take's start) to the first word. */
  leadInMs: Ms.nullable(),
})
export type ReadFaults = z.infer<typeof ReadFaultsSchema>

type ScriptToken = { token: string; breakAfter: boolean }

const BREAK = /[,;:.!?…–—\n]/

/**
 * The script's comparable words, each marked when a break follows it: a
 * comma, semicolon, colon, full stop, question or exclamation mark, ellipsis,
 * dash or line end before the next word. The last word ends the script, so it
 * is a break too.
 */
function scriptTokens(script: string): Array<ScriptToken> {
  const words = tokens(script)
  const between = script
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[\p{L}\p{N}]+/u)
  // `between[k + 1]` is the text after word `k`.
  return words.map((token, k) => ({
    token,
    breakAfter: k === words.length - 1 || BREAK.test(between[k + 1] ?? ""),
  }))
}

type Step = "match" | "substitute" | "skip" | "insert"

/**
 * A word-level edit alignment (Levenshtein) of what was said to the script:
 * for each spoken word, the script word it reads (or null when it was added),
 * and the counts of each step. Ties prefer reading a word over skipping one,
 * and skipping over adding, so the result is the same for the same input.
 */
function align(
  said: ReadonlyArray<string>,
  script: ReadonlyArray<string>
): { at: Array<number | null>; steps: Record<Step, number> } {
  const width = script.length + 1
  const cost = new Uint32Array((said.length + 1) * width)
  for (let j = 0; j <= script.length; j++) cost[j] = j
  for (let i = 1; i <= said.length; i++) {
    cost[i * width] = i
    for (let j = 1; j <= script.length; j++) {
      const diagonal =
        (cost[(i - 1) * width + j - 1] ?? 0) +
        (said[i - 1] === script[j - 1] ? 0 : 1)
      const skip = (cost[i * width + j - 1] ?? 0) + 1
      const insert = (cost[(i - 1) * width + j] ?? 0) + 1
      cost[i * width + j] = Math.min(diagonal, skip, insert)
    }
  }
  const at: Array<number | null> = Array.from(said, () => null)
  const steps: Record<Step, number> = {
    match: 0,
    substitute: 0,
    skip: 0,
    insert: 0,
  }
  let i = said.length
  let j = script.length
  while (i > 0 || j > 0) {
    const here = cost[i * width + j] ?? 0
    if (i > 0 && j > 0) {
      const same = said[i - 1] === script[j - 1]
      if (here === (cost[(i - 1) * width + j - 1] ?? 0) + (same ? 0 : 1)) {
        steps[same ? "match" : "substitute"] += 1
        at[i - 1] = j - 1
        i -= 1
        j -= 1
        continue
      }
    }
    if (j > 0 && here === (cost[i * width + j - 1] ?? 0) + 1) {
      steps.skip += 1
      j -= 1
      continue
    }
    steps.insert += 1
    i -= 1
  }
  return { at, steps }
}

/** Whether the added word at `k` says again a word spoken near it. */
function isRepeat(said: ReadonlyArray<string>, k: number): boolean {
  const from = Math.max(0, k - REPEAT_WINDOW)
  const to = Math.min(said.length - 1, k + REPEAT_WINDOW)
  for (let n = from; n <= to; n++) {
    if (n !== k && said[n] === said[k]) return true
  }
  return false
}

type Placed = SpokenToken & { breakAfter: boolean | null }

/**
 * The measured faults of one teleprompter read. Pure: same take, same record.
 * Fillers are set aside before the alignment, so one is always an added word
 * and never stands in for a script word.
 */
export function measureRead(take: ReadTake): ReadFaults {
  const spoken = spokenTokens(take.words)
  const script = scriptTokens(take.script)
  const content = spoken.filter((word) => !word.filler)
  const said = content.map((word) => word.token)
  const { at, steps } = align(
    said,
    script.map((word) => word.token)
  )
  const fillers = spoken.length - content.length
  const repeated = at.filter(
    (place, k) => place === null && isRepeat(said, k)
  ).length

  // Each spoken word with the break after the script word it reads: null for
  // a word the reader added. A filler takes the place of the word before it.
  const placeOf = new Map<SpokenToken, boolean | null>(
    content.map((word, k) => {
      const place = at[k] ?? null
      return [word, place === null ? null : (script[place]?.breakAfter ?? null)]
    })
  )
  const placed: Array<Placed> = []
  for (const word of spoken) {
    const before = placed.at(-1)?.breakAfter ?? null
    placed.push({
      ...word,
      breakAfter: word.filler ? before : (placeOf.get(word) ?? null),
    })
  }

  const gaps = gapsBetween(spoken)
  let atBreak = 0
  const stumbles: Array<number> = []
  gaps.forEach((gap, k) => {
    if (gap < READ_PAUSE_MS) return
    if (placed[k]?.breakAfter === true) atBreak += 1
    else stumbles.push(gap)
  })

  const phraseRates = phrasePaces(placed)
  return {
    words: spoken.length,
    script: {
      words: script.length,
      breaks: script.slice(0, -1).filter((word) => word.breakAfter).length,
    },
    misread: {
      skipped: steps.skip,
      substituted: steps.substitute,
      repeated,
      inserted: steps.insert - repeated + fillers,
      fillers,
    },
    pauses: {
      atBreak,
      midPhrase: stumbles.length,
      longestMidPhraseMs: stumbles.length === 0 ? null : Math.max(...stumbles),
    },
    pace: {
      wpm: perMinute(content.length, spokenMs(spoken)),
      phrases: phraseRates.length,
      variation: variation(phraseRates),
    },
    leadInMs: spoken.at(0)?.startMs ?? null,
  }
}

/**
 * The pace of each phrase long enough to time: the words, fillers aside,
 * from a break to the next, over the time from the first's start to the
 * last's end.
 */
function phrasePaces(placed: ReadonlyArray<Placed>): Array<number> {
  const paces: Array<number> = []
  let phrase: Array<Placed> = []
  const close = (): void => {
    const first = phrase.at(0)
    const last = phrase.at(-1)
    if (first !== undefined && last !== undefined) {
      const rate = perMinute(phrase.length, last.endMs - first.startMs)
      if (phrase.length >= MIN_PHRASE_WORDS && rate !== null) paces.push(rate)
    }
    phrase = []
  }
  for (const word of placed) {
    if (word.filler) continue
    phrase.push(word)
    if (word.breakAfter === true) close()
  }
  close()
  return paces
}

/** Standard deviation over mean; null under two values or a zero mean. */
function variation(values: ReadonlyArray<number>): number | null {
  if (values.length < 2) return null
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  if (mean === 0) return null
  const spread =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return Math.sqrt(spread) / mean
}
