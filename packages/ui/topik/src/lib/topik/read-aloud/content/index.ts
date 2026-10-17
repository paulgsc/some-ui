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
 * An occurrence may also name its grammatical role, and a line its tense:
 * what the grammar lens's step-down asks the learner to find. Both are
 * optional. A line may also carry what the grammar lens needs to ask about
 * it (Def. 4.9): a cue, misforms naming the mistake catalogue
 * (`read-aloud/mistakes`), and situations of use. All optional: a line
 * without them is read aloud as before.
 *
 * Content is checked at load, not trusted (Prop. 8.1, Thm. 8.2). A malformed
 * word, line or occurrence is dropped and reported, never the whole deck. A
 * line whose occurrences do not account for every word in it is dropped as
 * incomplete, since a sentence rep examines all of its words. A pronunciation
 * that does not align with its spelling is dropped on its own, and the
 * occurrence is shown without the substitution (Cor. 4.6 (iv)). An unknown
 * role or tense is dropped the same way: the occurrence or line is kept
 * without it.
 * Only a deck whose outer shape is wrong fails, and the caller refuses it
 * whole (`added-sets`).
 *
 * This is deliberately not `@some-ui/honeycomb`'s `WordEntry`. That format is
 * a typing challenge (a QWERTY key per jamo, an icon); this one is a reading
 * one (written forms in context, stems, pronunciations). They share only
 * their conventions: kebab-case ids and short glosses.
 */

import type { MistakeId } from "@topik/lib/topik/read-aloud/mistakes"
import { isMistakeId } from "@topik/lib/topik/read-aloud/mistakes"
import { z } from "zod"

// TYPES

export const READ_ALOUD_LEVELS = [1, 2, 3] as const
export type ReadAloudLevel = (typeof READ_ALOUD_LEVELS)[number]

/** The drill's level for a TOPIK level: its own, up to its highest. */
export const readAloudLevelFor = (topikLevel: number): ReadAloudLevel =>
  topikLevel <= 1 ? 1 : topikLevel === 2 ? 2 : 3

/** A concept: one word, named once per deck. */
export type ReadAloudWord = {
  /** Authored, stable, kebab-case (Def. 1.3). Never derived from `lemma`. */
  id: string
  /** Dictionary form, as content attached to the id: 드리다, 사람. */
  lemma: string
  /** Short English meaning of the dictionary form. */
  gloss: string
}

/**
 * What a written word does in its line, by the Korean question it answers:
 *
 * - `subject` 누가: marked 이/가
 * - `topic` 은·는: marked 은/는
 * - `object` 무엇을: marked 을/를
 * - `place` 어디서: where something is done, marked 에서
 * - `goal` 어디에: where to, or where something is, marked 에
 * - `time` 언제: when, marked 에 or a time word on its own (오늘, 매일)
 * - `means` 무엇으로: by what, marked (으)로
 * - `company` 누구와: with whom, marked 와/과/하고 (not "and")
 * - `describing` 어때요: a describing verb (커요, 좋아요)
 * - `action` 뭐 해요: an action verb (먹어요, 가요)
 */
const GRAMMAR_ROLES = [
  "subject",
  "topic",
  "object",
  "place",
  "goal",
  "time",
  "means",
  "company",
  "describing",
  "action",
] as const
export type GrammarRole = (typeof GRAMMAR_ROLES)[number]

/** A line's tense, read from the form of its last predicate. */
export const TENSES = ["past", "present", "future"] as const
export type Tense = (typeof TENSES)[number]

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
  /**
   * What the form does in this line. Given only where a learner can tell it
   * from the form itself: 친구와 in 친구와 먹어요 is `company`, but 아버지와 in
   * 아버지와 어머니가 is "and", and has none.
   */
  role?: GrammarRole
}

/**
 * One of a line's written words as learners are known to get it wrong
 * (Def. 4.9). Authored, never generated: an exchange of particles that makes
 * one line wrong can make another right (Rem. 4.7).
 */
type Misform = {
  /** Which written word it replaces: an index into the line's `words`. */
  word: number
  /** The wrong form, one whole run of Hangul. */
  surface: string
  mistake: MistakeId
  /** What this form does instead, for a learner who picked it. Never a gloss. */
  instead?: string
  /** The line's other words that make it wrong, marked at the reveal. */
  decides: Array<number>
  /** The cue's written words that make it wrong, marked at the reveal. */
  cueDecides: Array<string>
}

/** The line the grammar lens shows first, which sets what this one must be. */
type LensCue = {
  korean: string
  /** False when it is too long to be given as audio alone (Cor. 4.8). */
  hearable: boolean
}

/** When someone would say the line: one candidate is the author's. */
type Situations = {
  options: [string, string, string]
  intended: 0 | 1 | 2
}

/**
 * What the grammar lens asks about a line (Def. 4.9, Rem. 4.15): kept only
 * with at least one misform, since only such a line yields items.
 */
type LineLens = {
  cue?: LensCue
  misforms: Array<Misform>
  situations?: Situations
}

export type ReadAloudLine = {
  id: string
  level: ReadAloudLevel
  korean: string
  english: string
  /** Every word the line is authored with, in reading order. */
  words: Array<WordOccurrence>
  /**
   * The tense its form shows, for a line that is one statement or question.
   * Absent for a request (주세요), for two sentences, and where the form and
   * the meaning part (내일 만나요 is present in form, future in meaning).
   */
  tense?: Tense
  lens?: LineLens
}

export type ReadAloudDeck = {
  id: string
  title: string
  /**
   * What the deck answers, in the learner's terms: `your note on Oct 13:
   * "move to level two"`. Written by whoever made a deck for this learner
   * (`added-sets`); a deck written for anyone has none.
   */
  from?: string
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
  | "role-unknown"
  | "tense-unknown"
  | "lens-malformed"
  | "misform-malformed"
  | "misform-unknown-mistake"

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
  role: z.unknown().optional(),
})

const LineSchema = z.object({
  id: IdSchema,
  level: LevelSchema,
  korean: z.string().trim().min(1),
  english: z.string().trim().min(1),
  words: z.array(z.unknown()),
  tense: z.unknown().optional(),
  lens: z.unknown().optional(),
})

const LensSchema = z.object({
  cue: z.unknown().optional(),
  misforms: z.unknown().optional(),
  situations: z.unknown().optional(),
})

const CueSchema = z.object({
  korean: z
    .string()
    .trim()
    .regex(/[가-힣]/, "a cue is written in Hangul"),
  hearable: z.boolean().default(true),
})

const MisformSchema = z.object({
  word: z.number().int().min(0),
  surface: z.string().regex(HANGUL, "a misform is one run of Hangul"),
  mistake: z.string(),
  instead: z.string().trim().min(1).optional(),
  decides: z.array(z.number().int().min(0)).default([]),
  cueDecides: z.array(z.string()).default([]),
})

const Situation = z.string().trim().min(1)
const SituationsSchema = z
  .object({
    options: z.tuple([Situation, Situation, Situation]),
    intended: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  })
  .refine(({ options }) => new Set(options).size === 3, "options repeat")

const DeckSchema = z.object({
  schemaVersion: z.literal(1),
  id: IdSchema,
  title: z.string().trim().min(1),
  from: z.string().trim().min(1).max(200).optional(),
  words: z.array(z.unknown()),
  lines: z.array(z.unknown()),
})

const summarise = (error: z.ZodError): string =>
  error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ")

// PARSE

const isRole = (value: string): value is GrammarRole =>
  GRAMMAR_ROLES.some((role) => role === value)

const isTense = (value: string): value is Tense =>
  TENSES.some((tense) => tense === value)

/** An occurrence whose role, if any, is known: an unknown one is dropped. */
function withKnownRole(
  { role, ...rest }: z.infer<typeof OccurrenceSchema>,
  where: string,
  findings: Array<ContentFinding>
): WordOccurrence {
  if (role === undefined) return rest
  if (typeof role === "string" && isRole(role)) return { ...rest, role }
  findings.push({
    kind: "role-unknown",
    where,
    detail: `${JSON.stringify(role)} is not a grammatical role; the occurrence is kept without it`,
  })
  return rest
}

/**
 * What the grammar lens may ask about a line, each part checked on its own:
 * a malformed cue, misform or situation set is dropped and reported, and the
 * rest kept. A lens with no misform left asks nothing (Def. 4.9), so it is
 * dropped whole, and said so.
 */
function auditLens(
  raw: unknown,
  lineId: string,
  authored: ReadonlyArray<WordOccurrence | null>,
  findings: Array<ContentFinding>
): LineLens | null {
  // Where each authored word sits among those kept; null for one dropped.
  let next = 0
  const keptAt = authored.map((occurrence) =>
    occurrence === null ? null : next++
  )
  const kept = authored.filter((occurrence) => occurrence !== null)
  const where = `${lineId}/lens`
  const dropped = (kind: ContentFindingKind, detail: string): null => {
    findings.push({ kind, where, detail })
    return null
  }
  const lens = LensSchema.safeParse(raw)
  if (!lens.success) {
    return dropped(
      "lens-malformed",
      `${summarise(lens.error)}; the line is kept without its lens`
    )
  }

  let cue: LensCue | null = null
  let cueRuns: Array<string> = []
  if (lens.data.cue !== undefined) {
    const parsed = CueSchema.safeParse(lens.data.cue)
    if (parsed.success) {
      cue = parsed.data
      cueRuns = hangulRuns(cue.korean)
    } else {
      dropped("lens-malformed", `cue: ${summarise(parsed.error)}`)
    }
  }

  const candidates = Array.isArray(lens.data.misforms) ? lens.data.misforms : []
  if (lens.data.misforms !== undefined && !Array.isArray(lens.data.misforms)) {
    dropped("misform-malformed", "misforms is not a list")
  }
  let misforms: Array<Misform> = []
  for (const candidate of candidates) {
    const parsed = MisformSchema.safeParse(candidate)
    if (!parsed.success) {
      dropped("misform-malformed", summarise(parsed.error))
      continue
    }
    const { mistake, ...misform } = parsed.data
    const written = authored[misform.word]
    const at = keptAt[misform.word]
    const strayWord = misform.decides.find(
      (index) => index === misform.word || keptAt[index] == null
    )
    const strayCue = misform.cueDecides.find((word) => !cueRuns.includes(word))
    if (written == null || at == null) {
      dropped(
        "misform-malformed",
        `word ${misform.word} is not one of the line's kept words`
      )
    } else if (misform.surface === written.surface) {
      dropped(
        "misform-malformed",
        `"${misform.surface}" is the word as written`
      )
    } else if (
      misforms.some(
        (kept) => kept.word === at && kept.surface === misform.surface
      )
    ) {
      dropped("misform-malformed", `"${misform.surface}" is given twice`)
    } else if (!isMistakeId(mistake)) {
      dropped(
        "misform-unknown-mistake",
        `"${mistake}" is not in the mistake catalogue`
      )
    } else if (strayWord !== undefined) {
      dropped(
        "misform-malformed",
        `"${misform.surface}": decides ${strayWord} is not another of the line's words`
      )
    } else if (strayCue !== undefined) {
      dropped(
        "misform-malformed",
        `"${misform.surface}": ${strayCue} is not a word of the cue`
      )
    } else {
      misforms.push({
        ...misform,
        word: at,
        decides: misform.decides.flatMap((index) => keptAt[index] ?? []),
        mistake,
      })
    }
  }

  // A cue that holds the word a misform replaces, or a misform, gives the
  // answer away: 학교에 가요? spells the 학교에 the learner must choose. A
  // misform the cue decides goes with it: without the cue it may be right.
  if (cue) {
    const answers = new Set(
      misforms.flatMap((m) => [m.surface, kept[m.word]?.surface])
    )
    const telling = cueRuns.filter((run) => answers.has(run))
    if (telling.length > 0) {
      cue = dropped(
        "lens-malformed",
        `cue: ${telling.join(", ")} gives the answer away`
      )
      for (const misform of misforms.filter((m) => m.cueDecides.length > 0)) {
        dropped(
          "misform-malformed",
          `"${misform.surface}" is wrong only beside the cue`
        )
      }
      misforms = misforms.filter((m) => m.cueDecides.length === 0)
    }
  }

  let situations: Situations | null = null
  if (lens.data.situations !== undefined) {
    const parsed = SituationsSchema.safeParse(lens.data.situations)
    situations = parsed.success
      ? parsed.data
      : dropped("lens-malformed", `situations: ${summarise(parsed.error)}`)
  }

  if (misforms.length === 0) {
    return dropped(
      "lens-malformed",
      "no misform; a lens asks nothing without one"
    )
  }
  return {
    ...(cue === null ? {} : { cue }),
    misforms,
    ...(situations === null ? {} : { situations }),
  }
}

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
    const { tense: rawTense, lens: rawLens, ...line } = parsed.data
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
    // Each authored occurrence as kept, or null where it was dropped: a
    // lens indexes the authored list.
    const authored = line.words.map((rawOccurrence, position) => {
      const shaped = OccurrenceSchema.safeParse(rawOccurrence)
      if (!shaped.success) {
        findings.push({
          kind: "line-malformed",
          where: `${line.id}/words[${position}]`,
          detail: summarise(shaped.error),
        })
        return null
      }
      const known = withKnownRole(
        shaped.data,
        `${line.id}/${shaped.data.surface}`,
        findings
      )
      return auditOccurrence(known, audit, wordIds, findings)
    })
    const occurrences = authored.filter((kept) => kept !== null)

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
    let tense: { tense?: Tense } = {}
    if (rawTense !== undefined) {
      if (typeof rawTense === "string" && isTense(rawTense)) {
        tense = { tense: rawTense }
      } else {
        findings.push({
          kind: "tense-unknown",
          where: line.id,
          detail: `${JSON.stringify(rawTense)} is not a tense; the line is kept without it`,
        })
      }
    }
    const lens =
      rawLens === undefined
        ? null
        : auditLens(rawLens, line.id, authored, findings)
    lines.push({
      ...line,
      words: occurrences,
      ...tense,
      ...(lens === null ? {} : { lens }),
    })
  })

  return {
    ok: true,
    deck: {
      id: outer.data.id,
      title: outer.data.title,
      ...(outer.data.from === undefined ? {} : { from: outer.data.from }),
      words,
      lines,
    },
    findings,
  }
}
