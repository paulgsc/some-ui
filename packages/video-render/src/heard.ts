/**
 * What was heard in a take, word by word, and how words are compared, by two
 * hearings of a take (`hearings.ts`) and by Playoff Delta's fill check: case,
 * punctuation and a plural's `s` aside, and each spoken number one token,
 * however it is written (`21`, `twenty-one` and `twenty one` alike; `2,500`
 * and `two thousand five hundred`; `3.5` and `three point five`; `3rd` and
 * `third`).
 */

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
function normalized(word: string): string {
  const bare = word
    .toLowerCase()
    // A half is a decimal: `6½` as `6.5`, `½` as `0.5`.
    .replace(/(\d)½/g, "$1.5")
    .replace(/½/g, "0.5")
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
 * Whether `word` (lowercase, unpunctuated) names an order as the reader
 * reads one: `third`, `eleventh`, `twentieth`, `21st`.
 */
export const isOrdinal = (word: string): boolean =>
  cardinalOf(word) !== null || /^\d+(?:st|nd|rd|th)$/.test(word)

/**
 * The number spoken by the words from `from` on (`two hundred`, `twenty
 * one`, `three point five`, `third`, `six and a half`), and how many words
 * it took; null when
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
  if (
    NUMERAL.test(leading) &&
    words[at + 1] === "and" &&
    words[at + 2] === "a" &&
    words[at + 3] === "half"
  ) {
    // `7 and a half`, said as `7½` is written.
    const value = String(Number(leading) + 0.5)
    return { value: negative ? `-${value}` : value, length: at - from + 4 }
  }
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
  if (
    digits.length === 0 &&
    words[at] === "and" &&
    words[at + 1] === "a" &&
    words[at + 2] === "half"
  ) {
    // `six and a half`, said as `6½` is written.
    return { value: `${sign}${String(whole)}.5`, length: at - from + 3 }
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
