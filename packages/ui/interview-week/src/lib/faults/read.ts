import { z } from "zod"

import { MIN_PHRASE_WORDS, READ_PAUSE_MS, REPEAT_WINDOW } from "./thresholds"
import { Count, gapsBetween, longest, Ms, perMinute, Rate, wpm } from "./timing"
import {
  FILLERS,
  HeardWordsSchema,
  normalised,
  spokenTokens,
  tokens,
  type HeardWord,
  type SpokenToken,
} from "./words"

/**
 * The most comparable words either side of a read may hold, counted as the
 * alignment counts them (a hyphenated word is one per part): a 2-minute read
 * is a few hundred, and the alignment's cost is the product of the two sides.
 */
const READ_WORDS_MAX = 2000

export const ReadTakeSchema = z
  .object({
    words: HeardWordsSchema.refine(
      (words) => spokenTokens(words).length <= READ_WORDS_MAX,
      { message: "the read is longer than a read" }
    ),
    script: z.string(),
  })
  .refine((take) => tokens(take.script).length <= READ_WORDS_MAX, {
    message: "the script is longer than a read",
  })
// Written out, not inferred, so a caller may pass a readonly array.
export type ReadTake = { words: ReadonlyArray<HeardWord>; script: string }

/** The measured faults of a teleprompter read, against its script. */
export const ReadFaultsSchema = z.object({
  /** Every word heard, fillers included. */
  words: Count,
  /** The script's words, and the breaks between them (see `scriptTokens`). */
  script: z.object({ words: Count, breaks: Count }),
  /**
   * The read against the script, word by word: script words never said, said
   * as another word, and words the reader added. An added word is `repeated`
   * when it says again, within `REPEAT_WINDOW` words, a word that reads the
   * script or an earlier added word (so of two copies the second repeats),
   * and `inserted` otherwise; an added filler is inserted, and also counted
   * apart.
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
   * variation is an even, unvarying pace. A phrase is timed from its first
   * word to its last, so a stumble inside it slows it too.
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

const DIGITS = /^\p{N}+$/u
const BREAK = /[,;:.!?\u2026\u2013\u2014\n]|\s-+\s|--/

/**
 * The script's comparable words, each marked when a break follows it: a
 * comma, semicolon, colon, full stop, question or exclamation mark, ellipsis,
 * dash (a spaced hyphen too) or line end before the next word, except a full
 * stop, comma or colon between two numbers ("10:30", "3.5"). The last word
 * ends the script, so it is a break too.
 */
function scriptTokens(script: string): Array<ScriptToken> {
  const words = tokens(script)
  const between = normalised(script).split(/[\p{L}\p{N}]+/u)
  // `between[k + 1]` is the text after word `k`.
  return words.map((token, k) => {
    const after = between[k + 1] ?? ""
    const next = words[k + 1] ?? ""
    const inNumber =
      DIGITS.test(token) && DIGITS.test(next) && /^[.,:]$/.test(after)
    return {
      token,
      breakAfter: k === words.length - 1 || (!inNumber && BREAK.test(after)),
    }
  })
}

/** No alignment is this long, so a step that costs it is never taken. */
const NEVER = 1 << 20

/** What reading script word `b` as `a` costs: 0 the same, 1 another word. */
function readCost(a: string | undefined, b: string | undefined): number {
  if (a === b) return 0
  return FILLERS.has(a ?? "") || FILLERS.has(b ?? "") ? NEVER : 1
}

type Step = "match" | "substitute" | "skip" | "insert"

/**
 * A word-level edit alignment (Levenshtein) of what was said to the script:
 * for each spoken word, the script word it reads (or null when it was added),
 * and the counts of each step. A filler reads only the same filler in the
 * script ("Ah, that makes sense") and is otherwise added; a filler on either
 * side never stands in for another word. Ties prefer reading a word over
 * skipping one, and skipping over adding, so the result is the same for the
 * same input.
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
        readCost(said[i - 1], script[j - 1])
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
      const read = readCost(said[i - 1], script[j - 1])
      if (here === (cost[(i - 1) * width + j - 1] ?? 0) + read) {
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

/**
 * Whether the added word at `k` says again a word spoken near it: one the
 * script reads, or an earlier added one. Of two copies of an added word, the
 * second is the repeat.
 */
function isRepeat(
  said: ReadonlyArray<string>,
  at: ReadonlyArray<number | null>,
  k: number
): boolean {
  const from = Math.max(0, k - REPEAT_WINDOW)
  const to = Math.min(said.length - 1, k + REPEAT_WINDOW)
  for (let n = from; n <= to; n++) {
    if (n === k || said[n] !== said[k] || FILLERS.has(said[k] ?? "")) continue
    if (n < k || (at[n] ?? null) !== null) return true
  }
  return false
}

/**
 * For each spoken word, whether a break of the script lies between it and
 * the next word that reads the script: a break after any script word from the
 * last one read so far up to, not including, the next one read. A word
 * skipped before a full stop leaves the full stop where it was, and a word or
 * filler added at a break stays at it. Before the first word read is the
 * script's start, a break too.
 */
function breaksAfter(
  at: ReadonlyArray<number | null>,
  script: ReadonlyArray<ScriptToken>
): Array<boolean> {
  const next: Array<number> = Array.from(at, () => script.length)
  let ahead = script.length
  for (let k = at.length - 1; k >= 0; k--) {
    next[k] = ahead
    ahead = at[k] ?? ahead
  }
  let last: number | null = null
  return at.map((place, k) => {
    last = place ?? last
    if (last === null) return true
    for (let j = last; j < (next[k] ?? script.length); j++) {
      if (script[j]?.breakAfter === true) return true
    }
    return false
  })
}

type Placed = SpokenToken & { breakAfter: boolean }

/** The measured faults of one teleprompter read; throws on one the schema refuses. */
export function measureRead(take: ReadTake): ReadFaults {
  const { words: heard, script: text } = ReadTakeSchema.parse(take)
  const spoken = spokenTokens(heard)
  const script = scriptTokens(text)
  const said = spoken.map((word) => word.token)
  const { at, steps } = align(
    said,
    script.map((word) => word.token)
  )
  const fillers = spoken.filter(
    (word, k) => word.filler && at[k] === null
  ).length
  const repeated = at.filter(
    (place, k) => place === null && isRepeat(said, at, k)
  ).length

  const after = breaksAfter(at, script)
  const placed: Array<Placed> = spoken.map((word, k) => ({
    ...word,
    breakAfter: after[k] ?? true,
  }))

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
      inserted: steps.insert - repeated,
      fillers,
    },
    pauses: {
      atBreak,
      midPhrase: stumbles.length,
      longestMidPhraseMs: longest(stumbles),
    },
    pace: {
      wpm: wpm(spoken),
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
    if (!word.filler) phrase.push(word)
    if (word.breakAfter === true) close()
  }
  close()
  return paces
}

function variation(values: ReadonlyArray<number>): number | null {
  if (values.length < 2) return null
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  if (mean === 0) return null
  const spread =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return Math.sqrt(spread) / mean
}
