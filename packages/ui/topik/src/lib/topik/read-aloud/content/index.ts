/**
 * Read-aloud content: the words and graded lines the read-aloud drill
 * presents (adaptive-learning canon Def. 4.8, Cor. 4.6).
 *
 * A deck names its words once, by an authored identifier (Def. 1.3), and each
 * line lists every word it is written with: each run of Hangul in the line,
 * between spaces or punctuation, is exactly one listed occurrence, in reading
 * order.
 * A word rep shows one such written form; a sentence rep examines every word
 * its line lists (Def. 4.8's `K_e`). What the drill draws on the glyphs is
 * authored here too: where a written form's stem ends, and how it is
 * pronounced when that differs from its spelling (Cor. 4.6 (iv)).
 *
 * Content is checked at load, not trusted (Prop. 8.1, Thm. 8.2). A malformed
 * word, line or occurrence is dropped and reported, never the whole deck. A
 * line whose occurrences do not account for every word in it is dropped as
 * incomplete, since a sentence rep examines all of its words. A pronunciation
 * that does not align with its spelling is dropped on its own, and the
 * occurrence is shown without the substitution (Cor. 4.6 (iv)).
 * Only a deck whose outer shape is wrong fails, and the caller falls back to
 * the bundled starter deck.
 *
 * This is deliberately not `@some-ui/honeycomb`'s `WordEntry`. That format is
 * a typing challenge (a QWERTY key per jamo, an icon); this one is a reading
 * one (written forms in context, stems, pronunciations). They share only
 * their conventions: kebab-case ids and short glosses.
 */

import { z } from "zod"

// TYPES

export const READ_ALOUD_LEVELS = [1, 2, 3] as const
export type ReadAloudLevel = (typeof READ_ALOUD_LEVELS)[number]

/** A concept: one word, named once per deck. */
export type ReadAloudWord = {
  /** Authored, stable, kebab-case (Def. 1.3). Never derived from `lemma`. */
  id: string
  /** Dictionary form, as content attached to the id: 드리다, 사람. */
  lemma: string
  /** Short English meaning of the dictionary form. */
  gloss: string
}

/** One word as it is written in one line. */
export type WordOccurrence = {
  wordId: string
  /**
   * One whole run of Hangul from the line, exactly as written, with any
   * attached particle or ending: 드릴까요, 커피를. Never part of a run.
   */
  surface: string
  /**
   * How many of `surface`'s syllables belong to the stem; the rest are shown
   * as its ending at the gloss (Cor. 4.6 (iv)). Equal to the syllable count
   * when the form has no ending, as in 사람.
   */
  stemEnd: number
  /**
   * How `surface` is said in this line, when that differs from its spelling:
   * 원입니다 is said 워님니다. Same number of syllables as `surface`. Absent
   * when the spelling is the pronunciation.
   */
  pronunciation?: string
  /** What this form means here, when the dictionary gloss is not enough. */
  sense?: string
}

export type ReadAloudLine = {
  id: string
  level: ReadAloudLevel
  korean: string
  english: string
  /** Every word the line is authored with, in reading order. */
  words: Array<WordOccurrence>
}

export type ReadAloudDeck = {
  id: string
  title: string
  words: Array<ReadAloudWord>
  lines: Array<ReadAloudLine>
}

export type ContentFindingKind =
  | "word-malformed"
  | "word-duplicate"
  | "line-malformed"
  | "line-duplicate"
  | "occurrence-unknown-word"
  | "occurrence-not-in-line"
  | "occurrence-stem-out-of-range"
  | "pronunciation-misaligned"
  | "pronunciation-redundant"
  | "line-incomplete"
  | "line-without-words"

/** Something dropped at load, and why. */
export type ContentFinding = {
  kind: ContentFindingKind
  /** The id of the word or line concerned, or its index when it has none. */
  where: string
  detail: string
}

export type ParsedDeck =
  | { ok: true; deck: ReadAloudDeck; findings: Array<ContentFinding> }
  | { ok: false; error: string }

// SCHEMAS

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const HANGUL = /^[가-힣]+$/

const IdSchema = z.string().regex(ID, "ids are kebab-case ASCII")
const LevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3)])

const WordSchema = z.object({
  id: IdSchema,
  lemma: z.string().regex(HANGUL, "a lemma is Hangul syllables"),
  gloss: z.string().trim().min(1),
})

const OccurrenceSchema = z.object({
  wordId: IdSchema,
  surface: z.string().regex(HANGUL, "a written form is Hangul syllables"),
  stemEnd: z.number().int().min(1),
  pronunciation: z.string().optional(),
  sense: z.string().trim().min(1).optional(),
})

const LineSchema = z.object({
  id: IdSchema,
  level: LevelSchema,
  korean: z.string().trim().min(1),
  english: z.string().trim().min(1),
  words: z.array(z.unknown()),
})

const DeckSchema = z.object({
  schemaVersion: z.literal(1),
  id: IdSchema,
  title: z.string().trim().min(1),
  words: z.array(z.unknown()),
  lines: z.array(z.unknown()),
})

const summarise = (error: z.ZodError): string =>
  error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ")

// PARSE

/**
 * Check an occurrence against the line it sits in and the words the deck
 * names. Returns the occurrence as it may be shown - possibly without its
 * pronunciation - or null when it cannot be shown at all.
 */
type LineAudit = {
  id: string
  /** The line's runs of Hangul, in reading order: its written words. */
  runs: Array<string>
  /** Which runs a kept occurrence accounts for. */
  covered: Array<boolean>
  /** The first run the next occurrence may match. */
  next: number
}

/** A line's words as written: its maximal runs of Hangul syllables. */
const hangulRuns = (korean: string): Array<string> =>
  Array.from(korean.matchAll(/[가-힣]+/g), (match) => match[0])

function auditOccurrence(
  occurrence: WordOccurrence,
  line: LineAudit,
  wordIds: ReadonlySet<string>,
  findings: Array<ContentFinding>
): WordOccurrence | null {
  const where = `${line.id}/${occurrence.surface}`
  if (!wordIds.has(occurrence.wordId)) {
    findings.push({
      kind: "occurrence-unknown-word",
      where,
      detail: `no word "${occurrence.wordId}" in this deck`,
    })
    return null
  }

  // An occurrence is a whole run, never part of one (한 inside 따뜻한 is not
  // the word "one"), and occurrences come in reading order, so each is
  // matched against the runs after the previous one's.
  const found = line.runs.findIndex(
    (run, index) => index >= line.next && run === occurrence.surface
  )
  if (found === -1) {
    findings.push({
      kind: "occurrence-not-in-line",
      where,
      detail: `"${occurrence.surface}" is not one of the line's written words after the previous one`,
    })
    return null
  }
  line.next = found + 1

  const syllables = [...occurrence.surface].length
  if (occurrence.stemEnd > syllables) {
    findings.push({
      kind: "occurrence-stem-out-of-range",
      where,
      detail: `stemEnd ${occurrence.stemEnd} exceeds ${syllables} syllables`,
    })
    return null
  }

  line.covered[found] = true
  const { pronunciation, ...rest } = occurrence
  if (pronunciation === undefined) return occurrence
  if (pronunciation === occurrence.surface) {
    findings.push({
      kind: "pronunciation-redundant",
      where,
      detail: "the pronunciation equals the spelling; it is omitted",
    })
    return rest
  }
  if (!HANGUL.test(pronunciation) || [...pronunciation].length !== syllables) {
    // Cor. 4.6 (iv): shown without the substitution rather than dropped.
    findings.push({
      kind: "pronunciation-misaligned",
      where,
      detail: `"${pronunciation}" is not ${syllables} Hangul syllables; the occurrence is kept without it`,
    })
    return rest
  }
  return occurrence
}

/**
 * Parse a read-aloud deck, dropping and reporting what cannot be shown.
 *
 * Words and lines are parsed one at a time, so one bad entry costs only
 * itself. A line is kept only if its surviving occurrences account for every
 * word written in it: a sentence rep examines all of them (Def. 4.8), so a
 * line missing one is dropped as incomplete, and a line with no words at all
 * has no concepts to examine. A word that no line uses is kept: it can still
 * be read on its own.
 */
export function parseReadAloudDeck(raw: unknown): ParsedDeck {
  const outer = DeckSchema.safeParse(raw)
  if (!outer.success) return { ok: false, error: summarise(outer.error) }

  const findings: Array<ContentFinding> = []

  const words: Array<ReadAloudWord> = []
  const wordIds = new Set<string>()
  outer.data.words.forEach((candidate, index) => {
    const parsed = WordSchema.safeParse(candidate)
    if (!parsed.success) {
      findings.push({
        kind: "word-malformed",
        where: `words[${index}]`,
        detail: summarise(parsed.error),
      })
      return
    }
    // An id is identity (Thm. 1.1): a second word claiming it is dropped.
    if (wordIds.has(parsed.data.id)) {
      findings.push({
        kind: "word-duplicate",
        where: parsed.data.id,
        detail: "a word with this id already exists; the later one is dropped",
      })
      return
    }
    wordIds.add(parsed.data.id)
    words.push(parsed.data)
  })

  const lines: Array<ReadAloudLine> = []
  const lineIds = new Set<string>()
  outer.data.lines.forEach((candidate, index) => {
    const parsed = LineSchema.safeParse(candidate)
    if (!parsed.success) {
      findings.push({
        kind: "line-malformed",
        where: `lines[${index}]`,
        detail: summarise(parsed.error),
      })
      return
    }
    const line = parsed.data
    if (lineIds.has(line.id)) {
      findings.push({
        kind: "line-duplicate",
        where: line.id,
        detail: "a line with this id already exists; the later one is dropped",
      })
      return
    }
    lineIds.add(line.id)

    const runs = hangulRuns(line.korean)
    const audit: LineAudit = {
      id: line.id,
      runs,
      covered: runs.map(() => false),
      next: 0,
    }
    const occurrences = line.words.flatMap((rawOccurrence, position) => {
      const shaped = OccurrenceSchema.safeParse(rawOccurrence)
      if (!shaped.success) {
        findings.push({
          kind: "line-malformed",
          where: `${line.id}/words[${position}]`,
          detail: summarise(shaped.error),
        })
        return []
      }
      const kept = auditOccurrence(shaped.data, audit, wordIds, findings)
      return kept ? [kept] : []
    })

    const missing = runs.filter((_, index) => !audit.covered[index])
    if (missing.length > 0) {
      findings.push({
        kind: "line-incomplete",
        where: line.id,
        detail: `no kept occurrence for ${missing.map((run) => `"${run}"`).join(", ")}; the line is dropped`,
      })
      return
    }
    if (occurrences.length === 0) {
      findings.push({
        kind: "line-without-words",
        where: line.id,
        detail: "no occurrence survived; a line with no words is dropped",
      })
      return
    }
    lines.push({ ...line, words: occurrences })
  })

  return {
    ok: true,
    deck: { id: outer.data.id, title: outer.data.title, words, lines },
    findings,
  }
}
