/**
 * Does a take match its cut (STUDIO ST21, #2321)? A pure check over what
 * was heard in a take, for the take loop (ST8) and home's mechanical checks
 * (the `check-takes` step, `steps.ts`): no judgement of meaning, which stays
 * Claude's (`judge-takes`).
 *
 * - **A Read cut** is held to its line, word for word: how much of the line
 *   the take holds, and where its tightest reading sits in the take, so an
 *   aside or a false start before it, or an aside after it, gives trim points.
 * - **An Ad-lib cut** is held to its facts to keep: each fact's numbers and
 *   key terms must have been said, however the point was made. A missing
 *   number or term names the fact.
 * - **Numbers compare however they are written**: `21`, `twenty-one` and
 *   `twenty one` are one number, as are `2,500` and `two thousand five
 *   hundred`, `3.5` and `three point five`, `3rd` and `third`.
 * - **An unsure word was not said.** A word home was not sure of (ST22:
 *   its `p` under the floor), or that the two hearings disagree on (ST25:
 *   `unsure`), never matches; what it would have matched is reported as
 *   unsure rather than missing, since the audio may well hold it.
 * - **Accent mishearings are not this check's to judge**: they come out as a
 *   missing or unsure term, verdict `check`, and Claude reads by meaning.
 */

import { lcsTable } from "@some-ui/core-utils"

/** One word as home heard it (`some-ui.voice-transcript/1`, `words`). */
export type HeardWord = {
  readonly text: string
  readonly startMs: number
  readonly endMs: number
  /** How sure the model was, 0 to 1; a word without it counts as sure. */
  readonly p?: number
  /** The two hearings disagree on this word (ST25). */
  readonly unsure?: boolean
}

/** What a primer v2 cut asks of its take: a read cut always has its line. */
export type CutToCheck =
  | { readonly voice: "read"; readonly line: string }
  | {
      readonly voice: "ad-lib"
      /** The facts a take may neither drop nor contradict. */
      readonly keep: ReadonlyArray<string>
    }

export type TakeCheckOptions = {
  /** In place of `CONFIDENCE_FLOOR`. */
  readonly confidenceFloor?: number
}

/** What was not found of a fact, or of the line. */
export type Missing = {
  /** Heard only unsure: the audio may hold them. */
  readonly unsure: ReadonlyArray<string>
  /** Not heard at all. */
  readonly missing: ReadonlyArray<string>
}

export type TakeVerdict =
  /** The take says what its cut asks, with nothing to cut. */
  | { readonly kind: "ok" }
  /** The line is there, with something before or after it: cut to these. */
  | {
      readonly kind: "trim"
      readonly takeInMs: number
      readonly takeOutMs: number
    }
  /** Look at it: the line is partly there, or a fact is not whole. */
  | {
      readonly kind: "check"
      readonly facts: ReadonlyArray<{ readonly fact: string } & Missing>
      /** For a read cut: how much of the line was surely said, 0 to 1. */
      readonly coverage: number | null
    }
  /** Nothing usable was heard. */
  | { readonly kind: "redo"; readonly coverage: number | null }
  /** No transcript. */
  | { readonly kind: "missing" }

/** A word with `p` under this counts as unsure unless the caller says otherwise. */
export const CONFIDENCE_FLOOR = 0.5
/** Of the line's words, how much a read take must hold to pass. */
const READ_OK = 0.9
/** Under this, so little of the line was said, even unsure, that it is read again. */
const READ_CHECK = 0.5
/** A take may run this long before or after the line without a trim. */
const SLACK_MS = 700

/** Number words under a hundred. */
const SMALL: Readonly<Record<string, number>> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
}

/** Number words that multiply what came before them. */
const SCALE: Readonly<Record<string, number>> = {
  hundred: 100,
  thousand: 1_000,
  million: 1_000_000,
  billion: 1_000_000_000,
}

/** Ordinals not made by adding `th` or `ieth`; `second` is left out, being a unit of time too. */
const IRREGULAR_ORDINALS: Readonly<Record<string, string>> = {
  first: "one",
  third: "three",
  fifth: "five",
  eighth: "eight",
  ninth: "nine",
  twelfth: "twelve",
}

/** Words that carry no fact of their own. */
const STOP = new Set([
  "a",
  "about",
  "all",
  "also",
  "am",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "been",
  "being",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "here",
  "him",
  "his",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "just",
  "me",
  "more",
  "most",
  "much",
  "my",
  "no",
  "not",
  "of",
  "off",
  "on",
  "or",
  "our",
  "out",
  "over",
  "she",
  "so",
  "some",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "to",
  "up",
  "us",
  "very",
  "was",
  "we",
  "were",
  "what",
  "when",
  "which",
  "who",
  "will",
  "with",
  "would",
  "you",
  "your",
])

/**
 * A word as it is compared: lower case, punctuation off, both kinds of
 * apostrophe alike and a possessive `'s` off, `1,000` as `1000`, `3rd` as
 * `3`, a plural's `s` off (not a stop word's: `this`, `does`). Empty for
 * punctuation alone. Number words stay words here: `tokenized` reads them.
 */
export function normalized(word: string): string {
  const bare = word
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .replace(/[^\p{L}\p{N}.']+/gu, "")
    .replace(/^[.']+|[.']+$/g, "")
    .replace(/'s$/, "")
    .replace(/'/g, "")
  if (NUMERAL.test(bare)) return bare
  const ordinal = /^(\d+)(?:st|nd|rd|th)$/.exec(bare)
  if (ordinal?.[1] !== undefined) return ordinal[1]
  return bare.length > 3 &&
    bare.endsWith("s") &&
    !bare.endsWith("ss") &&
    !bare.endsWith("us") &&
    !STOP.has(bare)
    ? bare.slice(0, -1)
    : bare
}

/** Words that sign the number after them. */
const NEGATIVE: ReadonlySet<string> = new Set(["minus", "negative"])
const NUMERAL = /^\d+(\.\d+)?$/

/** The cardinal an ordinal word names (`third` as `three`), or null. */
function cardinalOf(word: string): string | null {
  const named =
    IRREGULAR_ORDINALS[word] ??
    (word.endsWith("ieth") ? `${word.slice(0, -4)}y` : null) ??
    (word.endsWith("th") ? word.slice(0, -2) : null)
  return named !== null && (named in SMALL || named in SCALE) ? named : null
}

/**
 * The number spoken by the words from `from` on (`two hundred`, `twenty
 * one`, `three point five`, `third`), and how many words it took; null when
 * `words[from]` is not a number word.
 */
function spokenNumber(
  words: ReadonlyArray<string>,
  from: number
): { readonly value: string; readonly length: number } | null {
  // `group` is the part under a thousand; `total` what bigger scales made.
  let total = 0
  let group = 0
  let lastScale = Infinity
  let at = from
  const negative = NEGATIVE.has(words[at] ?? "")
  if (negative) at += 1
  const leading = words[at] ?? ""
  // A numeral a scale follows (`2 million`) is that scale's group.
  if (NUMERAL.test(leading) && SCALE[words[at + 1] ?? ""] !== undefined) {
    group = Number(leading)
    at += 1
  }
  const start = at
  while (at < words.length) {
    const word = words[at] ?? ""
    const cardinal = cardinalOf(word)
    const name = cardinal ?? word
    const small = SMALL[name]
    const scale = SCALE[name]
    const started = at > from && !(negative && at === from + 1)
    if (small !== undefined) {
      const fits =
        small === 0
          ? !started
          : group % 100 === 0 ||
            (group % 100 >= 20 && group % 10 === 0 && small < 10)
      if (!fits) break
      group += small
    } else if (scale === 100) {
      if (group >= 100 || (started && group === 0)) break
      group = (group === 0 ? 1 : group) * 100
    } else if (scale !== undefined) {
      if (scale >= lastScale || (started && group === 0)) break
      total += (group === 0 ? 1 : group) * scale
      group = 0
      lastScale = scale
    } else if (
      word === "and" &&
      total + group > 0 &&
      group % 100 === 0 &&
      (SMALL[words[at + 1] ?? ""] ?? 0) > 0
    ) {
      at += 1
      continue
    } else {
      break
    }
    at += 1
    // Nothing follows an ordinal or a zero.
    if (cardinal !== null || small === 0) break
  }
  if (at === start && group === 0) {
    // `minus 5`, or `-5` as split: the numeral, signed.
    const numeral = words[at] ?? ""
    return negative && NUMERAL.test(numeral)
      ? { value: `-${numeral}`, length: at - from + 1 }
      : null
  }
  const whole = total + group
  const digits: Array<number> = []
  if (cardinalOf(words[at - 1] ?? "") === null && words[at] === "point") {
    for (let next = at + 1; next < words.length; next += 1) {
      const digit = SMALL[words[next] ?? ""]
      if (digit === undefined || digit > 9) break
      digits.push(digit)
    }
  }
  const sign = negative ? "-" : ""
  const after = SCALE[words[at + 1 + digits.length] ?? ""]
  if (digits.length > 0 && after !== undefined && after >= 1000) {
    // `two point five million`: the decimal is that scale's group.
    const scaled = Number(`${whole}.${digits.join("")}`) * after
    return {
      value: `${sign}${String(scaled)}`,
      length: at - from + 2 + digits.length,
    }
  }
  return digits.length === 0
    ? { value: `${sign}${String(whole)}`, length: at - from }
    : {
        value: `${sign}${String(whole)}.${digits.join("")}`,
        length: at - from + 1 + digits.length,
      }
}

/** A word as compared, and the first and last of the raw words it came from. */
export type Token = {
  readonly word: string
  readonly first: number
  readonly last: number
}

/**
 * The words of `raw` as compared: each split at its hyphens and
 * normalized, and each spoken number made one token.
 */
export function tokenized(raw: ReadonlyArray<string>): Array<Token> {
  const pieces = raw.flatMap((text, at) =>
    text
      // A minus before a numeral is a sign, not a hyphen between words.
      .replace(/^[-\u2212](?=\d)/, "minus-")
      .split(/[-\u2013\u2014]/)
      .map(normalized)
      .filter((word) => word !== "")
      .map((word) => ({ word, first: at, last: at }))
  )
  const words = pieces.map((piece) => piece.word)
  const out: Array<Token> = []
  for (let at = 0; at < pieces.length; ) {
    const number = spokenNumber(words, at)
    const length = number?.length ?? 1
    const first = pieces[at]
    const last = pieces[at + length - 1]
    if (first !== undefined && last !== undefined) {
      out.push({
        word: number?.value ?? first.word,
        first: first.first,
        last: last.last,
      })
    }
    at += length
  }
  return out
}

function tokens(text: string): Array<string> {
  return tokenized(text.split(/\s+/)).map((token) => token.word)
}

/** The numbers in a fact, as said, and its key terms. */
export function factTerms(fact: string): {
  numbers: Array<string>
  terms: Array<string>
} {
  const words = tokens(fact)
  return {
    numbers: words.filter((word) => /^-?\d/.test(word)),
    terms: words.filter((word) => !/^-?\d/.test(word) && !STOP.has(word)),
  }
}

type Said = {
  readonly word: string
  readonly sure: boolean
  readonly startMs: number
  readonly endMs: number
}

/** A take's words as compared, and which words it holds surely or only unsure. */
type Hearing = {
  readonly said: ReadonlyArray<Said>
  readonly sure: ReadonlySet<string>
  readonly unsure: ReadonlySet<string>
}

function hearingOf(heard: ReadonlyArray<HeardWord>, floor: number): Hearing {
  const isSure = (word: HeardWord | undefined): boolean =>
    word !== undefined &&
    word.unsure !== true &&
    (word.p === undefined || word.p >= floor)
  const said = tokenized(heard.map((word) => word.text)).map(
    ({ word, first, last }) => ({
      word,
      sure: heard.slice(first, last + 1).every(isSure),
      startMs: heard[first]?.startMs ?? 0,
      endMs: heard[last]?.endMs ?? 0,
    })
  )
  return {
    said,
    sure: new Set(said.filter((word) => word.sure).map((word) => word.word)),
    unsure: new Set(said.filter((word) => !word.sure).map((word) => word.word)),
  }
}

/**
 * The tightest reading of `line` in `words`: of the alignments that match
 * the most of the line, the one spanning the fewest words, the latest on a
 * tie. For each line word, the index of the word it matched, or null.
 */
function tightestMatch(
  line: ReadonlyArray<string>,
  words: ReadonlyArray<string>
): Array<number | null> {
  const most = lcsTable(line, words)[0]?.[0] ?? 0
  let tightest: {
    table: Array<Array<number>>
    from: number
    to: number
  } | null = null
  for (let to = 0; most > 0 && to < words.length; to += 1) {
    if (!line.includes(words[to] ?? "")) continue
    // table[0][from]: the most of the line matched in words[from..to].
    const table = lcsTable(line, words.slice(0, to + 1))
    let from = to
    while (from >= 0 && table[0]?.[from] !== most) from -= 1
    if (
      from >= 0 &&
      (tightest === null || to - from <= tightest.to - tightest.from)
    ) {
      tightest = { table, from, to }
    }
  }
  const matched: Array<number | null> = line.map(() => null)
  if (tightest === null) return matched
  const { table, to } = tightest
  let i = 0
  let j = tightest.from
  while (i < line.length && j <= to) {
    if (line[i] === words[j]) {
      matched[i] = j
      i += 1
      j += 1
    } else if ((table[i + 1]?.[j] ?? 0) >= (table[i]?.[j + 1] ?? 0)) {
      i += 1
    } else {
      j += 1
    }
  }
  return matched
}

function readVerdict(
  line: string,
  { said, unsure: heardUnsure }: Hearing
): TakeVerdict {
  const words = tokens(line)
  if (words.length === 0 || said.length === 0) {
    return { kind: "redo", coverage: said.length === 0 ? 0 : null }
  }
  const sure = said.filter((word) => word.sure)
  const matched = tightestMatch(
    words,
    sure.map((word) => word.word)
  )
  const hits = matched
    .map((at) => (at === null ? undefined : sure[at]))
    .filter((word) => word !== undefined)
  const notFound = words.filter((_, at) => matched[at] === null)
  const unsure = notFound.filter((word) => heardUnsure.has(word))
  const coverage = hits.length / words.length
  if ((hits.length + unsure.length) / words.length < READ_CHECK) {
    return { kind: "redo", coverage }
  }
  // A word of the line the take may well hold is always worth a look.
  if (coverage < READ_OK || unsure.length > 0) {
    return {
      kind: "check",
      coverage,
      facts: [
        {
          fact: line,
          unsure,
          missing: notFound.filter((word) => !heardUnsure.has(word)),
        },
      ],
    }
  }
  const from = hits[0]
  const to = hits.at(-1)
  const start = said[0]
  const end = said.at(-1)
  if (
    from === undefined ||
    to === undefined ||
    start === undefined ||
    end === undefined
  ) {
    return { kind: "ok" }
  }
  const before = from.startMs - start.startMs
  const after = end.endMs - to.endMs
  return before > SLACK_MS || after > SLACK_MS
    ? { kind: "trim", takeInMs: from.startMs, takeOutMs: to.endMs }
    : { kind: "ok" }
}

function adLibVerdict(
  keep: ReadonlyArray<string>,
  { said, sure, unsure }: Hearing
): TakeVerdict {
  if (said.length === 0) return { kind: "redo", coverage: null }
  const facts = keep.flatMap((fact) => {
    const { numbers, terms } = factTerms(fact)
    const wanted = [...numbers, ...terms].filter((word) => !sure.has(word))
    if (wanted.length === 0) return []
    return [
      {
        fact,
        unsure: wanted.filter((word) => unsure.has(word)),
        missing: wanted.filter((word) => !unsure.has(word)),
      },
    ]
  })
  return facts.length === 0
    ? { kind: "ok" }
    : { kind: "check", facts, coverage: null }
}

/**
 * The verdict on a take of `cut`, from what was heard in it; `missing` when
 * nothing has heard it yet (`heard` is null).
 */
export function checkTake(
  cut: CutToCheck,
  heard: ReadonlyArray<HeardWord> | null,
  options: TakeCheckOptions = {}
): TakeVerdict {
  if (heard === null) return { kind: "missing" }
  const hearing = hearingOf(heard, options.confidenceFloor ?? CONFIDENCE_FLOOR)
  return cut.voice === "read"
    ? readVerdict(cut.line, hearing)
    : adLibVerdict(cut.keep, hearing)
}
