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
 *   when the take check reads the words again. A written word the two partly
 *   agree on (`two-year` against `three-year`) goes word by word, so the
 *   part both heard (`year`) is kept.
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
  /** Its place among the take's gaps. */
  readonly side: number
}

/** The alignment in the take's order: each word both heard, and each gap. */
type Segment =
  | { readonly kind: "both"; readonly home: Timed }
  | ({ readonly kind: "gap" } & Gap)

function segmentsOf(steps: ReadonlyArray<Pairing>): Array<Segment> {
  const segments: Array<Segment> = []
  let open: Gap | null = null
  let sides = 0
  for (const step of steps) {
    if (step.kind === "both") {
      open = null
      segments.push({ kind: "both", home: step.a })
      continue
    }
    if (open === null) {
      open = { home: [], session: [], side: sides }
      sides += 1
      segments.push({ kind: "gap", ...open })
    }
    if (step.kind === "a") open.home.push(step.a)
    else open.session.push(step.b)
  }
  return segments
}

/** Every raw word index `tokens` came from, in order, each once. */
function rawOf(tokens: ReadonlyArray<Timed>): Array<number> {
  const indices = new Set<number>()
  for (const token of tokens) {
    for (let at = token.first; at <= token.last; at += 1) indices.add(at)
  }
  return [...indices].sort((a, b) => a - b)
}

/** Whether a gap holds more than fillers. */
const differs = (gap: Gap): boolean =>
  [...gap.home, ...gap.session].some((token) => !FILLERS.has(token.word))

/** A word the take check reads as a number. */
const isNumber = (token: Timed): boolean => /^-?\d/.test(token.word)

/** How each raw word of a hearing went out: as heard, or as its tokens' words. */
type Went = Map<number, "heard" | "folded">

/**
 * `tokens`' words, from `heard`, for the take check, each raw word at most
 * once across calls that share `went`: a raw word as heard where `whole`
 * says `tokens`' side of the alignment holds all of it, and otherwise each
 * token as the word it reads as, with the least `p` of the words it was
 * said in. With `numerals`, a number is always the one numeral it reads as.
 */
function wordsOf(
  tokens: ReadonlyArray<Timed>,
  heard: ReadonlyArray<HeardWord>,
  {
    whole,
    went,
    numerals,
  }: { whole: (at: number) => boolean; went: Went; numerals: boolean }
): Array<HeardWord> {
  const out: Array<HeardWord> = []
  for (const token of tokens) {
    const span: Array<number> = []
    for (let at = token.first; at <= token.last; at += 1) span.push(at)
    const asHeard = !(numerals && isNumber(token)) && span.every(whole)
    if (asHeard && span.every((at) => !went.has(at))) {
      for (const at of span) {
        const word = heard[at]
        if (word !== undefined) out.push(word)
        went.set(at, "heard")
      }
      continue
    }
    if (asHeard && span.every((at) => went.get(at) === "heard")) continue
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
 * Of each raw word of a hearing, which side of the alignment holds it: a
 * gap's index, or -1 for words both heard; `null` where its tokens fall on
 * more than one side (`two-year` against `three-year`: `2` differs, `year`
 * agrees).
 */
function sidesOf(
  sides: ReadonlyArray<{ tokens: ReadonlyArray<Timed>; side: number }>
): Map<number, number | null> {
  const of = new Map<number, number | null>()
  for (const { tokens, side } of sides) {
    for (const token of tokens) {
      for (let at = token.first; at <= token.last; at += 1) {
        of.set(at, of.has(at) && of.get(at) !== side ? null : side)
      }
    }
  }
  return of
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
  const segments = segmentsOf(steps)
  const gaps = segments.flatMap((segment) =>
    segment.kind === "gap" ? [segment] : []
  )
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

  // A raw word goes out as heard only where one side holds all of it, and
  // otherwise token by token, so a word both heard alike is kept beside the
  // part of its raw word the two differ on.
  const homeSides = sidesOf([
    {
      tokens: steps.flatMap((step) => (step.kind === "both" ? [step.a] : [])),
      side: -1,
    },
    ...gaps.map((gap) => ({ tokens: gap.home, side: gap.side })),
  ])
  const sessionSides = sidesOf([
    {
      tokens: steps.flatMap((step) => (step.kind === "both" ? [step.b] : [])),
      side: -1,
    },
    ...gaps.map((gap) => ({ tokens: gap.session, side: gap.side })),
  ])
  const homeWent: Went = new Map()
  const sessionWent: Went = new Map()
  const words: Array<ComparedWord> = []
  for (const segment of segments) {
    if (segment.kind === "both") {
      words.push(
        ...wordsOf([segment.home], home, {
          whole: (at) => homeSides.get(at) === -1,
          went: homeWent,
          numerals: false,
        }).map((word) => compared(word, "both", false))
      )
      continue
    }
    const unsure = differs(segment)
    words.push(
      ...wordsOf(segment.home, home, {
        whole: (at) => homeSides.get(at) === segment.side,
        went: homeWent,
        numerals: true,
      }).map((word) => compared(word, "home", unsure)),
      ...wordsOf(segment.session, session, {
        whole: (at) => sessionSides.get(at) === segment.side,
        went: sessionWent,
        numerals: true,
      }).map((word) => compared(shifted(word, offsetMs), "session", unsure))
    )
  }

  const textOf = (heard: ReadonlyArray<HeardWord>, at: Array<number>): string =>
    at
      .map((index) => heard[index]?.text.trim() ?? "")
      .filter((text) => text !== "")
      .join(" ")
  const disagreements = gaps.filter(differs).map((gap) => {
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
