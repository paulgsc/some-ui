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
 *   it is, the session's on home's clock.
 * - **A filler is never a difference**: `um`, `uh` and the like, heard by
 *   one engine only, are kept as that engine heard them.
 *
 * Pure: the cost is the two hearings' word counts multiplied, a few
 * thousand cells for a take of a scene.
 */

import { lcsTable } from "@some-ui/core-utils"

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

export type CompareHearingsOptions = {
  /** In place of `DRIFT_MS`. */
  readonly driftMs?: number
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

/** One place in the alignment: a word both heard, or one only one heard. */
type Pairing =
  | { readonly kind: "both"; readonly home: Timed; readonly session: Timed }
  | { readonly kind: "home"; readonly home: Timed }
  | { readonly kind: "session"; readonly session: Timed }

/** The longest alignment of `home` with `session` under `same`. */
function aligned(
  home: ReadonlyArray<Timed>,
  session: ReadonlyArray<Timed>,
  same: (a: Timed, b: Timed) => boolean
): Array<Pairing> {
  const table = lcsTable(home, session, same)
  const steps: Array<Pairing> = []
  let i = 0
  let j = 0
  while (i < home.length || j < session.length) {
    const a = home[i]
    const b = session[j]
    if (
      a !== undefined &&
      b !== undefined &&
      same(a, b) &&
      table[i]?.[j] === (table[i + 1]?.[j + 1] ?? 0) + 1
    ) {
      steps.push({ kind: "both", home: a, session: b })
      i += 1
      j += 1
    } else if (
      a !== undefined &&
      (b === undefined || (table[i + 1]?.[j] ?? 0) >= (table[i]?.[j + 1] ?? 0))
    ) {
      steps.push({ kind: "home", home: a })
      i += 1
    } else if (b !== undefined) {
      steps.push({ kind: "session", session: b })
      j += 1
    }
  }
  return steps
}

function median(values: ReadonlyArray<number>): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0
  return Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2)
}

/** How much later the session places the words both heard alike, by word alone. */
function offsetOf(
  home: ReadonlyArray<Timed>,
  session: ReadonlyArray<Timed>
): number {
  const gaps = aligned(home, session, (a, b) => a.word === b.word).flatMap(
    (step) =>
      step.kind === "both" ? [step.session.startMs - step.home.startMs] : []
  )
  return gaps.length === 0 ? 0 : median(gaps)
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
      after = step.home.last
      continue
    }
    if (open === null) {
      open = { home: [], session: [], after }
      gaps.push(open)
    }
    if (step.kind === "home") open.home.push(step.home)
    else open.session.push(step.session)
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

/**
 * `home` and `session`, two hearings of the same take, lined up: the words
 * for the take check with `unsure` where they differ, and each stretch where
 * they do.
 */
export function compareHearings(
  home: ReadonlyArray<HeardWord>,
  session: ReadonlyArray<HeardWord>,
  options: CompareHearingsOptions = {}
): HearingsCompared {
  const drift = options.driftMs ?? DRIFT_MS
  const ours = timed(home)
  const theirs = timed(session)
  const offsetMs = offsetOf(ours, theirs)
  const steps = aligned(
    ours,
    theirs,
    (a, b) =>
      a.word === b.word && Math.abs(b.startMs - offsetMs - a.startMs) <= drift
  )
  const gaps = gapsOf(steps).map((gap) => ({
    ...gap,
    differs: [...gap.home, ...gap.session].some((token) => !isFiller(token)),
  }))

  // Each home word: heard alike by both, or by home alone; unsure when a
  // word it holds is in a stretch where the two differ.
  const homeAlone = new Set(rawOf(gaps.flatMap((gap) => gap.home)))
  const homeUnsure = new Set(
    rawOf(gaps.filter((gap) => gap.differs).flatMap((gap) => gap.home))
  )
  const onHomeClock = (word: HeardWord): HeardWord => ({
    ...word,
    startMs: Math.max(0, word.startMs - offsetMs),
    endMs: Math.max(0, word.endMs - offsetMs),
  })
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

  // The session's words where the two differ, placed after the home word
  // they follow.
  const sessionAfter = new Map<number, Array<ComparedWord>>()
  for (const gap of gaps) {
    const words = rawOf(gap.session).flatMap((at) => {
      const word = session[at]
      return word === undefined
        ? []
        : [compared(onHomeClock(word), "session", gap.differs)]
    })
    if (words.length === 0) continue
    const at = Math.max(gap.after, ...rawOf(gap.home))
    sessionAfter.set(at, [...(sessionAfter.get(at) ?? []), ...words])
  }

  const words: Array<ComparedWord> = [...(sessionAfter.get(-1) ?? [])]
  home.forEach((word, at) => {
    words.push(
      compared(word, homeAlone.has(at) ? "home" : "both", homeUnsure.has(at))
    )
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
        ...gap.session.map((token) => ({
          ...token,
          startMs: Math.max(0, token.startMs - offsetMs),
          endMs: Math.max(0, token.endMs - offsetMs),
        })),
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
