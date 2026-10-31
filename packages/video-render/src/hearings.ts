/**
 * Two hearings of one take, lined up (STUDIO ST25, #2323). Home's
 * whisper.cpp (multilingual `small`) and the session's faster-whisper
 * (`small.en`) each hear every take, from the same bytes (the takes
 * manifest's `sha256`). Different engines make different mistakes, so where
 * they agree is evidence, and where they differ marks the words to check:
 * each such word comes back `unsure`, which ST21's take check reads as not
 * said and reports as unsure (`take-check.ts`), and each place they differ
 * is listed for ST24's review.
 *
 * - **Words compare as the take check compares them** (`tokenized`): case,
 *   punctuation and a plural's `s` aside, and a number however each engine
 *   wrote it, so `21` and `twenty-one` agree.
 * - **Lined up by time as well as by word**: a word agrees with the other
 *   hearing's same word only within `DRIFT_MS` of it, once the session's
 *   clock is set to home's (the median gap over the words both heard), so a
 *   word heard at another moment is a difference, not a match.
 * - **Home's words are the base**: home keeps the take and hears Korean as
 *   Korean, so where the two agree the word is home's, with home's time and
 *   `p`. Where they differ, both hearings' words are kept, each marked whose
 *   it is, the session's on home's clock, and a number there as the one
 *   numeral it reads as, so it never runs into the other hearing's number
 *   when the take check reads the words again.
 * - **A filler is never a difference**: `um`, `uh` and the like, heard by
 *   one engine only, are kept as that engine heard them.
 *
 * Pure: the cost is the two hearings' word counts multiplied, a few
 * thousand cells for a take of a scene.
 */

import type { LcsStep } from "@some-ui/core-utils"
import { lcsAlignment, median } from "@some-ui/core-utils"

import type { HeardWord, Token } from "./take-check"
import { tokenized } from "./take-check"

/** Who heard a take: home's transcriber, or the session's. */
export type Hearer = "home" | "session"

/** One word of a take's two hearings lined up, on home's clock. */
export type ComparedWord = HeardWord & {
  /** Both hearings heard it alike, or only this one did. */
  readonly heardBy: "both" | Hearer
}

/** A stretch of the take where the two hearings differ. */
export type Disagreement = {
  /** On home's clock, over both hearings' words there. */
  readonly startMs: number
  readonly endMs: number
  /** What home heard there; empty when it heard nothing. */
  readonly home: string
  /** What the session heard there; empty when it heard nothing. */
  readonly session: string
}

export type HearingsCompared = {
  /**
   * For the take check: home's words where the two agree, and both
   * hearings' words, `unsure`, where they differ, in the take's order.
   */
  readonly words: ReadonlyArray<ComparedWord>
  /** Each stretch where they differ, in the take's order. */
  readonly disagreements: ReadonlyArray<Disagreement>
  /** How many words both heard alike. */
  readonly agreed: number
  /** How much later the session's clock read than home's. */
  readonly offsetMs: number
}

/** How far apart two engines may place one word and still agree on it. */
export const DRIFT_MS = 1_000

/** Words that carry nothing, which one engine writes and another leaves out. */
const FILLERS: ReadonlySet<string> = new Set([
  "ah",
  "eh",
  "er",
  "erm",
  "hm",
  "hmm",
  "mm",
  "mhm",
  "uh",
  "uhm",
  "um",
])

/** A compared word of one hearing, with its time. */
type Timed = Token & { readonly startMs: number; readonly endMs: number }

function timed(heard: ReadonlyArray<HeardWord>): Array<Timed> {
  return tokenized(heard.map((word) => word.text)).map((token) => ({
    ...token,
    startMs: heard[token.first]?.startMs ?? 0,
    endMs: heard[token.last]?.endMs ?? 0,
  }))
}

/** One place in the alignment: a word both heard (`a` home's, `b` the session's), or one only one heard. */
type Pairing = LcsStep<Timed>

/** How much later the session places the words both heard alike, by word alone. */
function offsetOf(
  home: ReadonlyArray<Timed>,
  session: ReadonlyArray<Timed>
): number {
  const gaps = lcsAlignment(home, session, (a, b) => a.word === b.word).flatMap(
    (step) => (step.kind === "both" ? [step.b.startMs - step.a.startMs] : [])
  )
  return Math.round(median(gaps) ?? 0)
}

/** `span` moved `byMs` earlier, never before the take's start. */
function shifted<
  T extends { readonly startMs: number; readonly endMs: number },
>(span: T, byMs: number): T {
  return {
    ...span,
    startMs: Math.max(0, span.startMs - byMs),
    endMs: Math.max(0, span.endMs - byMs),
  }
}

/** A stretch of words only one hearing heard, between two both heard. */
type Gap = {
  readonly home: Array<Timed>
  readonly session: Array<Timed>
  /** The last home word before it, by index into home's words; -1 at the start. */
  readonly after: number
}

function gapsOf(steps: ReadonlyArray<Pairing>): Array<Gap> {
  const gaps: Array<Gap> = []
  let open: Gap | null = null
  let after = -1
  for (const step of steps) {
    if (step.kind === "both") {
      open = null
      after = step.a.last
      continue
    }
    if (open === null) {
      open = { home: [], session: [], after }
      gaps.push(open)
    }
    if (step.kind === "a") open.home.push(step.a)
    else open.session.push(step.b)
  }
  return gaps
}

/** Every raw word index `tokens` came from, in order, each once. */
function rawOf(tokens: ReadonlyArray<Timed>): Array<number> {
  const indices = new Set<number>()
  for (const token of tokens) {
    for (let at = token.first; at <= token.last; at += 1) indices.add(at)
  }
  return [...indices].sort((a, b) => a - b)
}

const isFiller = (token: Timed): boolean => FILLERS.has(token.word)

/** A word the take check reads as a number. */
const isNumber = (token: Timed): boolean => /^-?\d/.test(token.word)

/**
 * `tokens`' words, from `heard`, for the take check: a number as the one
 * numeral it reads as, with the least `p` of the words it was said in; any
 * other word as heard, each raw word once.
 */
function wordsOf(
  tokens: ReadonlyArray<Timed>,
  heard: ReadonlyArray<HeardWord>
): Array<HeardWord> {
  const out: Array<HeardWord> = []
  // How each raw word went out: as heard, or folded into a token's word.
  const went = new Map<number, "heard" | "folded">()
  for (const token of tokens) {
    const span: Array<number> = []
    for (let at = token.first; at <= token.last; at += 1) span.push(at)
    if (!isNumber(token) && span.every((at) => !went.has(at))) {
      for (const at of span) {
        const word = heard[at]
        if (word !== undefined) out.push(word)
        went.set(at, "heard")
      }
      continue
    }
    if (!isNumber(token) && span.every((at) => went.get(at) === "heard")) {
      continue
    }
    const ps = span.flatMap((at) => {
      const p = heard[at]?.p
      return p === undefined ? [] : [p]
    })
    out.push({
      text: token.word,
      startMs: token.startMs,
      endMs: token.endMs,
      ...(ps.length > 0 ? { p: Math.min(...ps) } : {}),
    })
    for (const at of span) went.set(at, "folded")
  }
  return out
}

/**
 * `home` and `session`, two hearings of the same take, lined up: the words
 * for the take check with `unsure` where they differ, and each stretch where
 * they do.
 */
export function compareHearings(
  home: ReadonlyArray<HeardWord>,
  session: ReadonlyArray<HeardWord>
): HearingsCompared {
  const ours = timed(home)
  const theirs = timed(session)
  const offsetMs = offsetOf(ours, theirs)
  const steps = lcsAlignment(
    ours,
    theirs,
    (a, b) =>
      a.word === b.word &&
      Math.abs(b.startMs - offsetMs - a.startMs) <= DRIFT_MS
  )
  const gaps = gapsOf(steps).map((gap) => ({
    ...gap,
    differs: [...gap.home, ...gap.session].some((token) => !isFiller(token)),
  }))
  const compared = (
    word: HeardWord,
    heardBy: ComparedWord["heardBy"],
    unsure: boolean
  ): ComparedWord => ({
    ...word,
    text: word.text.trim(),
    heardBy,
    ...(unsure ? { unsure: true } : {}),
  })

  // Home's words of each stretch go at its first raw word, in place of the
  // raw words it holds; the session's after its last home word, or after
  // the home word it follows.
  const homeAt = new Map<number, Array<ComparedWord>>()
  const sessionAfter = new Map<number, Array<ComparedWord>>()
  const inGap = new Set<number>()
  for (const gap of gaps) {
    const raw = rawOf(gap.home)
    for (const at of raw) inGap.add(at)
    const first = raw[0]
    if (first !== undefined) {
      homeAt.set(
        first,
        wordsOf(gap.home, home).map((word) =>
          compared(word, "home", gap.differs)
        )
      )
    }
    const words = wordsOf(gap.session, session).map((word) =>
      compared(shifted(word, offsetMs), "session", gap.differs)
    )
    if (words.length === 0) continue
    const at = Math.max(gap.after, ...raw)
    sessionAfter.set(at, [...(sessionAfter.get(at) ?? []), ...words])
  }

  const words: Array<ComparedWord> = [...(sessionAfter.get(-1) ?? [])]
  home.forEach((word, at) => {
    if (inGap.has(at)) words.push(...(homeAt.get(at) ?? []))
    else words.push(compared(word, "both", false))
    words.push(...(sessionAfter.get(at) ?? []))
  })

  const textOf = (heard: ReadonlyArray<HeardWord>, at: Array<number>): string =>
    at
      .map((index) => heard[index]?.text.trim() ?? "")
      .filter((text) => text !== "")
      .join(" ")
  const disagreements = gaps
    .filter((gap) => gap.differs)
    .map((gap) => {
      const spans = [
        ...gap.home,
        ...gap.session.map((token) => shifted(token, offsetMs)),
      ]
      return {
        startMs: Math.min(...spans.map((token) => token.startMs)),
        endMs: Math.max(...spans.map((token) => token.endMs)),
        home: textOf(home, rawOf(gap.home)),
        session: textOf(session, rawOf(gap.session)),
      }
    })

  return {
    words,
    disagreements,
    agreed: steps.filter((step) => step.kind === "both").length,
    offsetMs,
  }
}
