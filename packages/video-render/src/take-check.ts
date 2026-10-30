/**
 * Does a take match its cut (STUDIO ST21, #2321)? A pure check over what
 * was heard in a take, for the take loop (ST8) and home's mechanical checks
 * (the `check-takes` step, `steps.ts`): no judgement of meaning, which stays
 * Claude's (`judge-takes`).
 *
 * - **A Read cut** is held to its line, word for word: how much of the line
 *   the take holds, and where the line sits in the take, so an aside before
 *   or after it gives trim points.
 * - **An Ad-lib cut** is held to its facts to keep: each fact's numbers and
 *   key terms must have been said, however the point was made. A missing
 *   number or term names the fact.
 * - **An unsure word was not said.** A word home was not sure of (ST22:
 *   its `p` under the floor), or that the two hearings disagree on (ST25:
 *   `unsure`), never matches; what it would have matched is reported as
 *   unsure rather than missing, since the audio may well hold it.
 * - **Accent mishearings are not this check's to judge** (the skill's
 *   "Qur'an" for Korean): they come out as a missing or unsure term, verdict
 *   `check`, and Claude reads by meaning.
 *
 * Verdicts, as the build-journal skill's `take_qa.py` gave them: `ok`, `trim`
 * (with the points to cut to), `check` (with what to look at), `redo`
 * (nothing usable was heard) and `missing` (no transcript at all).
 */

/** One word as home heard it (`some-ui.voice-transcript/1`, `words`). */
export type HeardWord = {
  readonly text: string
  readonly startMs: number
  readonly endMs: number
  /** How sure the model was, 0 to 1; absent for a word heard before it was kept. */
  readonly p?: number
  /** The two hearings disagree on this word (ST25). */
  readonly unsure?: boolean
}

/** What a primer v2 cut asks of its take. */
export type CutToCheck = {
  readonly voice: "read" | "ad-lib"
  /** The words to read; needed for a read cut. */
  readonly line: string | null
  /** The facts a take may neither drop nor contradict. */
  readonly keep: ReadonlyArray<string>
}

export type TakeCheckOptions = {
  /** A word with `p` under this was not said. */
  readonly confidenceFloor?: number
}

/** What was not found of a fact, or of the line. */
export type Missing = {
  /** Said with no confidence, or heard differently by the two hearings. */
  readonly unsure: ReadonlyArray<string>
  /** Not heard at all. */
  readonly missing: ReadonlyArray<string>
}

export type TakeVerdict =
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
      /** For a read cut: how much of the line was said, 0 to 1. */
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
/** Under this, so little of the line was said that it is read again. */
const READ_CHECK = 0.5
/** A take may run this long before or after the line without a trim. */
const SLACK_MS = 700

const NUMBER_WORDS: Readonly<Record<string, string>> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
  thirteen: "13",
  fourteen: "14",
  fifteen: "15",
  sixteen: "16",
  seventeen: "17",
  eighteen: "18",
  nineteen: "19",
  twenty: "20",
  thirty: "30",
  forty: "40",
  fifty: "50",
  sixty: "60",
  seventy: "70",
  eighty: "80",
  ninety: "90",
  hundred: "100",
  thousand: "1000",
}

/** Words that carry no fact of their own. */
const STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "of",
  "in",
  "on",
  "at",
  "to",
  "for",
  "by",
  "with",
  "from",
  "as",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "we",
  "you",
  "i",
  "my",
  "our",
  "your",
  "has",
  "have",
  "had",
  "not",
  "no",
  "so",
  "than",
  "then",
  "there",
  "here",
  "up",
  "out",
  "off",
  "over",
  "into",
  "which",
  "who",
  "what",
  "when",
  "did",
  "do",
  "does",
  "will",
  "would",
  "can",
  "could",
  "just",
  "very",
  "also",
  "all",
  "any",
  "some",
  "more",
  "most",
  "much",
])

/**
 * A word as it is compared: lower case, punctuation off, `1,000` as `1000`,
 * `three` as `3`, a plural's `s` off. Empty for punctuation alone.
 */
export function normalized(word: string): string {
  const bare = word
    .toLowerCase()
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .replace(/[^\p{L}\p{N}.'-]+/gu, "")
    .replace(/^[.'-]+|[.'-]+$/g, "")
  if (bare === "") return ""
  const number = NUMBER_WORDS[bare]
  if (number !== undefined) return number
  if (/^\d+(\.\d+)?$/.test(bare)) return bare
  return bare.length > 3 && bare.endsWith("s") && !bare.endsWith("ss")
    ? bare.slice(0, -1)
    : bare
}

/** The words of `text`, normalized, with the empty ones left out. */
function tokens(text: string): Array<string> {
  return text
    .split(/\s+/)
    .map(normalized)
    .filter((word) => word !== "")
}

/** The numbers in a fact, as said, and its key terms. */
export function factTerms(fact: string): {
  numbers: Array<string>
  terms: Array<string>
} {
  const words = tokens(fact)
  return {
    numbers: words.filter((word) => /^\d/.test(word)),
    terms: words.filter(
      (word) => !/^\d/.test(word) && word.length >= 4 && !STOP.has(word)
    ),
  }
}

type Said = {
  readonly word: string
  readonly sure: boolean
  readonly startMs: number
  readonly endMs: number
}

function heardAs(heard: ReadonlyArray<HeardWord>, floor: number): Array<Said> {
  return heard.flatMap((word) => {
    const text = normalized(word.text)
    if (text === "") return []
    const sure =
      word.unsure !== true && (word.p === undefined || word.p >= floor)
    return [{ word: text, sure, startMs: word.startMs, endMs: word.endMs }]
  })
}

/**
 * The longest run of `line`'s words said in order among the sure words:
 * for each line word, the heard word it matched, or null.
 */
function aligned(
  line: ReadonlyArray<string>,
  said: ReadonlyArray<Said>
): Array<number | null> {
  const sure = said
    .map((word, at) => ({ word: word.word, at }))
    .filter(({ at }) => said[at]?.sure === true)
  const n = line.length
  const m = sure.length
  // lcs[i][j]: the longest match of line[i..] against sure[j..].
  const lcs: Array<Array<number>> = Array.from({ length: n + 1 }, () =>
    Array.from<number>({ length: m + 1 }).fill(0)
  )
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      const down = lcs[i + 1]?.[j] ?? 0
      const right = lcs[i]?.[j + 1] ?? 0
      const diagonal = lcs[i + 1]?.[j + 1] ?? 0
      const row = lcs[i]
      if (row !== undefined) {
        row[j] =
          line[i] === sure[j]?.word ? diagonal + 1 : Math.max(down, right)
      }
    }
  }
  const matched: Array<number | null> = Array.from<null>({ length: n }).fill(
    null
  )
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (line[i] === sure[j]?.word) {
      matched[i] = sure[j]?.at ?? null
      i += 1
      j += 1
    } else if ((lcs[i + 1]?.[j] ?? 0) >= (lcs[i]?.[j + 1] ?? 0)) {
      i += 1
    } else {
      j += 1
    }
  }
  return matched
}

function readVerdict(line: string, said: ReadonlyArray<Said>): TakeVerdict {
  const words = tokens(line)
  if (words.length === 0 || said.length === 0) {
    return { kind: "redo", coverage: said.length === 0 ? 0 : null }
  }
  const matched = aligned(words, said)
  const hits = matched.filter((at) => at !== null)
  const coverage = hits.length / words.length
  if (coverage < READ_CHECK) return { kind: "redo", coverage }
  const unsureWords = new Set(
    said.filter((word) => !word.sure).map((word) => word.word)
  )
  const notFound = words.filter((_, at) => matched[at] === null)
  const unsure = notFound.filter((word) => unsureWords.has(word))
  // A word of the line the take may well hold is always worth a look.
  if (coverage < READ_OK || unsure.length > 0) {
    return {
      kind: "check",
      coverage,
      facts: [
        {
          fact: line,
          unsure,
          missing: notFound.filter((word) => !unsureWords.has(word)),
        },
      ],
    }
  }
  const first = hits[0]
  const last = hits.at(-1)
  const from = first === undefined ? undefined : said[first]
  const to = last === undefined ? undefined : said[last]
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
  said: ReadonlyArray<Said>
): TakeVerdict {
  if (said.length === 0) return { kind: "redo", coverage: null }
  const sure = new Set(said.filter((word) => word.sure).map((w) => w.word))
  const unsureWords = new Set(
    said.filter((word) => !word.sure).map((word) => word.word)
  )
  const facts = keep.flatMap((fact) => {
    const { numbers, terms } = factTerms(fact)
    const wanted = [...numbers, ...terms].filter((word) => !sure.has(word))
    if (wanted.length === 0) return []
    return [
      {
        fact,
        unsure: wanted.filter((word) => unsureWords.has(word)),
        missing: wanted.filter((word) => !unsureWords.has(word)),
      },
    ]
  })
  return facts.length === 0
    ? { kind: "ok" }
    : { kind: "check", facts, coverage: null }
}

/**
 * The verdict on a take of `cut`, from what was heard in it; `null` when
 * nothing has heard it yet.
 */
export function checkTake(
  cut: CutToCheck,
  heard: ReadonlyArray<HeardWord> | null,
  options: TakeCheckOptions = {}
): TakeVerdict {
  if (heard === null) return { kind: "missing" }
  const said = heardAs(heard, options.confidenceFloor ?? CONFIDENCE_FLOOR)
  return cut.voice === "read" && cut.line !== null
    ? readVerdict(cut.line, said)
    : adLibVerdict(cut.keep, said)
}
