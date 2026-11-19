/**
 * A week of mock interview, `some-ui.interview-week/2` (IW8, #3175) and the
 * first version, `/1` (IW4, #2935).
 *
 * A week sets an invented company and role. It holds two flows (#2931):
 *
 * - **Questions** the owner answers in their own words, one take each, aimed
 *   at 2 minutes at most and stopping at 3. A question names its family and variant from the closed list
 *   below. A decision question also names the recorded call it draws on
 *   (`source`).
 * - **Teleprompter cards** the owner reads verbatim after a cue. Each card's
 *   script presents why one piece of this repo's work exists: an epic, a doc
 *   or a declared invariant (`source`).
 *
 * Takes name what they answer by IW1's refs: `<week>:<question>` for an
 * answer and `<week>:read:<card>` for a read. So a week's id is lowercase
 * `YYYY-wNN`, and question and card ids are kebab slugs of at most 64
 * characters. No question is named `read`.
 *
 * What the file never holds, by design:
 *
 * - **A real employer's name.** The interview is faux (owner, 2026-11-13).
 *   The routine's `finish` checks the week's texts against the employers it
 *   knows, as written (`lib/monday/employers.ts`, C279).
 * - **A score.** Nothing in a week grades the owner. Every object is strict,
 *   so a field like `score` is refused rather than ignored.
 *
 * **The essay's opening** (IW10, #3177): a `/2` week may begin its cards with
 * one card, `opening`, that presents the essay itself: the owner's moniker
 * and what the week trains, read in the owner's voice so the essay opens on
 * it. It is a card like any other to the phone, home and the send; the
 * essay takes it out of the reads (`isOpening`, C618). A week without one
 * reads as before.
 *
 * **The second version** (`some-ui.interview-week/2`, IW8, #3175) adds to each
 * question its `ready` answer, the first rung of its ladder: a good answer in
 * parts, each with a note on why it works; another good answer in another
 * shape; a poor answer with notes on why it is poor; and cue words for saying
 * it from cues. On a question about the body of work (`GROUND`, `work`) every
 * claim names its source (`WorkSource`), which the routine checks exists at
 * the week's commit; on an open question a claim may. A first-version week,
 * written before, has no ready answers and still reads.
 *
 * The schema holds the shape and its counts. `readWeek` adds what relates one
 * field to another: dates, ids, and each family's variants and source.
 */
import { assertNever, weekAround } from "@some-ui/core-utils"
import { z } from "zod"

/** The version the routine writes: a week with ready answers (IW8). */
export const INTERVIEW_WEEK_SCHEMA = "some-ui.interview-week/2"
/** The first version (IW4), with no ready answers; weeks written before IW8 still read. */
export const INTERVIEW_WEEK_SCHEMA_V1 = "some-ui.interview-week/1"

/** A week's id: its ISO year and week in lower case, like `2026-w47` (rust-week's `WEEK_ID`, IW1's refs). */
export const WEEK_ID = /^\d{4}-w(?:0[1-9]|[1-4]\d|5[0-3])$/

/** A question's or card's id: a kebab slug, as IW1's refs take it. */
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const SLUG_MAX = 64

/** The one id a question may not take: it would make an answer's ref read as a read's. */
export const RESERVED_QUESTION_ID = "read"

/**
 * The question families, a closed list (#2935), each with its variants in
 * the order the routine first asks them, and what each variant asks. The
 * routine rotates each family's variants over the weeks, least recently
 * asked first. A variant's id never changes, since the weeks it was asked in
 * name it.
 */
/** The families, in the order a week asks them. */
export const FAMILY_IDS = [
  "about-yourself",
  "a-time-you",
  "why-this-role",
  "strengths-weaknesses",
  "decision",
] as const
export type Family = (typeof FAMILY_IDS)[number]

export const FAMILIES = {
  "about-yourself": {
    "walk-me-through": "Walk me through your background.",
    "what-you-build": "Tell me about yourself and the kind of work you do.",
    "how-you-got-here": "How did you get to where you are now?",
  },
  "a-time-you": {
    conflict: "Tell me about a time you disagreed with someone at work.",
    failure: "Tell me about a time something you built failed.",
    success: "Tell me about a time you are proud of.",
    ambiguity: "Tell me about a time you worked with unclear requirements.",
    feedback: "Tell me about a time you received hard feedback.",
  },
  "why-this-role": {
    "why-this-role": "Why this role?",
    "why-this-company": "Why this company?",
    "why-now": "Why are you looking now?",
  },
  "strengths-weaknesses": {
    strength: "What is your greatest strength?",
    weakness: "What is a weakness of yours?",
    growing: "What are you working to get better at?",
  },
  decision: {
    "why-this-over-that":
      "Why did you choose this over the other options you had?",
    "the-trade-off": "What did that choice cost, and what did it buy?",
    "what-would-undo-it": "What would make you undo that choice?",
  },
} as const satisfies Record<Family, Record<string, string>>

/**
 * What a question's answer rests on (IW8; the owner, 2026-11-17), two kinds
 * that never mix:
 *
 * - **`open`:** a generic question ("tell me about yourself"). Its ready
 *   answer follows the structure research agrees on and is skewed to the
 *   owner, without having to speak about the code. A claim may cite the body
 *   of work, and needn't.
 * - **`work`:** a question about the body of work itself: the repositories,
 *   the apps, the infrastructure. Its answer is concrete and falsifiable, so
 *   every claim names its source, and the essay checks the owner's answer
 *   against those sources.
 *
 * Code decides it from the family, never the model (LEVERS, #2162).
 */
export const GROUNDS = ["open", "work"] as const
export type Ground = (typeof GROUNDS)[number]

export const GROUND: Record<Family, Ground> = {
  "about-yourself": "open",
  "a-time-you": "open",
  "why-this-role": "open",
  "strengths-weaknesses": "open",
  decision: "work",
}

/** How long an answer in each family should run, in seconds: at most `TARGET_MAX_SECONDS` (#2931). */
export const TARGET_SECONDS: Record<Family, number> = {
  "about-yourself": 90,
  "a-time-you": 120,
  "why-this-role": 60,
  "strengths-weaknesses": 90,
  decision: 120,
}

/**
 * A take's cap: 3 minutes (owner, 2026-11-19, C735), a minute past the
 * longest target, so a slower read of a full script never stops short.
 */
export const TAKE_MAX_SECONDS = 180

/** The longest a question's answer or a card's read is aimed at (#2931, #2935). */
const TARGET_MAX_SECONDS = 120
/** A card's read runs 1 to 2 minutes (#2935). */
export const CARD_MIN_SECONDS = 60

/** The essay's opening's card, read in `OPENING_SECONDS` (IW10). */
export const OPENING_CARD = "opening"
export const OPENING_SECONDS = { min: 10, max: 40 } as const

const QUESTIONS_MIN = 4
const QUESTIONS_MAX = 6
const CARDS_MIN = 2
const CARDS_MAX = 4

export const TextSchema = z
  .string()
  .refine((text) => text.trim() !== "", "must not be empty")

const WhenSchema = z.iso.datetime({ offset: true })

const IdSchema = z
  .string()
  .max(SLUG_MAX, `an id is at most ${SLUG_MAX} characters`)
  .regex(
    SLUG,
    "an id is a kebab slug: lowercase letters and digits, words joined by single hyphens"
  )

const RepoSchema = z.enum(["some-ui", "server"])

/** The recorded call (`docs/calls/<ID>.json`, ST37) a decision question draws on. */
const CallSourceSchema = z.strictObject({
  kind: z.literal("call"),
  id: z.string().regex(/^C\d+$/, "a call's id, like C266"),
})

/** What a card presents: an epic, a doc, a declared invariant (`**<ID>:` in a doc), or the essay's opening. */
const CardSourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("opening") }),
  z.strictObject({
    kind: z.literal("issue"),
    repo: RepoSchema,
    number: z.int().positive(),
  }),
  z.strictObject({ kind: z.literal("doc"), path: TextSchema }),
  z.strictObject({
    kind: z.literal("invariant"),
    id: z.string().regex(/^[A-Z][A-Z0-9]*\d+$/, "an invariant's id, like RS1"),
    path: TextSchema,
  }),
])
export type CardSource = z.infer<typeof CardSourceSchema>

/**
 * A piece of the owner's body of work a ready answer's claim rests on: a pull
 * request or an issue in either repo, a recorded call, a doc, or a declared
 * invariant. The routine refuses one the week's commit doesn't hold
 * (`lib/monday/finish.ts`).
 */
export const WorkSourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("pull"),
    repo: RepoSchema,
    number: z.int().positive(),
  }),
  z.strictObject({
    kind: z.literal("issue"),
    repo: RepoSchema,
    number: z.int().positive(),
  }),
  CallSourceSchema,
  z.strictObject({ kind: z.literal("doc"), path: TextSchema }),
  z.strictObject({
    kind: z.literal("invariant"),
    id: z.string().regex(/^[A-Z][A-Z0-9]*\d+$/, "an invariant's id, like RS1"),
    path: TextSchema,
  }),
])
export type WorkSource = z.infer<typeof WorkSourceSchema>

/** A source's key, as the routine's inventory names it: `pull:some-ui#3170`, `call:C266`. */
export function workSourceKey(source: WorkSource): string {
  switch (source.kind) {
    case "pull":
    case "issue": {
      return `${source.kind}:${source.repo}#${source.number}`
    }
    case "call": {
      return `call:${source.id}`
    }
    case "doc": {
      return `doc:${source.path}`
    }
    case "invariant": {
      return `invariant:${source.id}`
    }
    default: {
      return assertNever(source)
    }
  }
}

/** A claim's sources: required on a `work` question's claims (`readWeek`), optional on an `open` one's. */
const SourcesSchema = z.array(WorkSourceSchema).max(4)

/** One part of a good answer: what is said, and a note on why it works. */
const PartSchema = z.strictObject({
  /** What the part does: "The situation", "The options". */
  label: TextSchema,
  /** Said as written, first person. */
  text: TextSchema,
  /** Why this part works, for the study page. */
  note: TextSchema,
  sources: SourcesSchema,
})
export type ReadyPart = z.infer<typeof PartSchema>

/** Parts a ready answer has: enough for a shape, few enough to study on a phone. */
export const READY_PARTS = { min: 3, max: 6 } as const

/**
 * A question's ready answer (IW8), the first rung of its ladder. Rung 2 reads
 * `answer`'s texts aloud, in order; rung 3 says it from `cues`.
 */
export const ReadySchema = z.strictObject({
  answer: z.array(PartSchema).min(READY_PARTS.min).max(READY_PARTS.max),
  /** Another good answer, in another shape, with why it also works. */
  another: z.strictObject({
    text: TextSchema,
    note: TextSchema,
    sources: SourcesSchema,
  }),
  /** A poor answer, and why it is poor; what its notes check names its source. */
  poor: z.strictObject({
    text: TextSchema,
    notes: z.array(TextSchema).min(2).max(5),
    sources: z.array(WorkSourceSchema).max(4),
  }),
  /** A few words each, to lean on while saying it (rung 3). */
  cues: z.array(TextSchema).min(3).max(8),
})
export type Ready = z.infer<typeof ReadySchema>

const QuestionSchema = z.strictObject({
  id: IdSchema,
  family: z.enum(FAMILY_IDS),
  variant: IdSchema,
  /** The question as the interviewer asks it. */
  prompt: TextSchema,
  /** How long a good answer runs; running past it is a fault (rambling). */
  targetSeconds: z.int().positive().max(TARGET_MAX_SECONDS),
  /** What a good answer covers, for the invented role; the essay reads the answer against them. */
  guidelines: z.array(TextSchema).min(2).max(5),
  /** A decision question's call; absent on every other question. */
  source: CallSourceSchema.optional(),
  /**
   * What its answer rests on (`GROUND`), kept on the question so weeks and
   * takes can be queried and pivoted by it as they accumulate: on every
   * question of a second-version week, as its family says.
   */
  ground: z.enum(GROUNDS).optional(),
  /** Its ready answer: on every question of a second-version week, none of a first's. */
  ready: ReadySchema.optional(),
})
export type Question = z.infer<typeof QuestionSchema>

const CardSchema = z.strictObject({
  id: IdSchema,
  source: CardSourceSchema,
  /** Where a read like this is given: the cue the owner reads after. */
  situation: TextSchema,
  /** Read verbatim, first person; a line break where a breath belongs. */
  script: TextSchema,
  /** Within `cardBounds`, which `readWeek` holds. */
  targetSeconds: z.int().min(OPENING_SECONDS.min).max(TARGET_MAX_SECONDS),
})
export type Card = z.infer<typeof CardSchema>

/** Whether `card` is the essay's opening (IW10). */
export const isOpening = (card: Pick<Card, "source">): boolean =>
  card.source.kind === "opening"

/** How long `card` may be read, in seconds: the opening's bounds, or any other card's. */
export const cardBounds = (
  card: Pick<Card, "source">
): { readonly min: number; readonly max: number } =>
  isOpening(card)
    ? OPENING_SECONDS
    : { min: CARD_MIN_SECONDS, max: TARGET_MAX_SECONDS }

const questionCount = `a week has ${QUESTIONS_MIN} to ${QUESTIONS_MAX} questions`
const cardCount = `a week has ${CARDS_MIN} to ${CARDS_MAX} cards`

export const InterviewWeekSchema = z.strictObject({
  schema: z.enum([INTERVIEW_WEEK_SCHEMA, INTERVIEW_WEEK_SCHEMA_V1]),
  id: z
    .string()
    .regex(WEEK_ID, "a week's id is its ISO year and week, like 2026-w47"),
  /** Which routine wrote it: `claude-routine`. */
  by: TextSchema,
  /** Monday 00:00, the owner's time. */
  opens: WhenSchema,
  /** Sunday 23:59, the owner's time. A take not sent by then doesn't count. */
  due: WhenSchema,
  company: z.strictObject({
    /** Invented: never a real employer's name. */
    name: TextSchema,
    about: TextSchema,
  }),
  role: z.strictObject({ title: TextSchema, about: TextSchema }),
  questions: z
    .array(QuestionSchema)
    .min(QUESTIONS_MIN, questionCount)
    .max(QUESTIONS_MAX, questionCount),
  cards: z
    .array(CardSchema)
    .min(CARDS_MIN, cardCount)
    .max(CARDS_MAX, cardCount),
})
export type InterviewWeek = z.infer<typeof InterviewWeekSchema>

export type WeekReading =
  | { ok: true; week: InterviewWeek }
  | { ok: false; problems: Array<string> }

function relations(week: InterviewWeek): Array<string> {
  const problems: Array<string> = []
  const around = weekAround(new Date(week.opens))
  if (week.opens !== around.opens || week.due !== around.due) {
    problems.push(
      `a week opens Monday 00:00 and is due Sunday 23:59, the owner's time: ${around.opens} and ${around.due}`
    )
  }
  if (week.id !== around.id) {
    problems.push(`the week that opens ${around.monday} is ${around.id}`)
  }
  const ids = new Set<string>()
  week.questions.forEach((question, i) => {
    const at = `questions[${i}] ("${question.id}")`
    if (question.id === RESERVED_QUESTION_ID) {
      problems.push(`${at}: no question may be named "${RESERVED_QUESTION_ID}"`)
    }
    if (ids.has(question.id)) problems.push(`${at}: its id is used twice`)
    ids.add(question.id)
    const variants: Readonly<Record<string, string>> = FAMILIES[question.family]
    if (!Object.hasOwn(variants, question.variant)) {
      problems.push(
        `${at}: ${question.family}'s variants are ${Object.keys(variants).join(", ")}`
      )
    }
    if (
      (week.schema === INTERVIEW_WEEK_SCHEMA) !==
      (question.ready !== undefined)
    ) {
      problems.push(
        week.schema === INTERVIEW_WEEK_SCHEMA
          ? `${at}: every question of a ${INTERVIEW_WEEK_SCHEMA} week has its ready answer`
          : `${at}: a ${INTERVIEW_WEEK_SCHEMA_V1} week holds no ready answer`
      )
    }
    if (
      question.ground !== undefined &&
      question.ground !== GROUND[question.family]
    ) {
      problems.push(
        `${at}: the ${question.family} family's ground is ${GROUND[question.family]}`
      )
    }
    if (
      (week.schema === INTERVIEW_WEEK_SCHEMA) !==
      (question.ground !== undefined)
    ) {
      problems.push(
        week.schema === INTERVIEW_WEEK_SCHEMA
          ? `${at}: every question of a ${INTERVIEW_WEEK_SCHEMA} week names its ground`
          : `${at}: a ${INTERVIEW_WEEK_SCHEMA_V1} week names no ground`
      )
    }
    if (question.ready !== undefined && GROUND[question.family] === "work") {
      const unsourced = [
        ...question.ready.answer.map((part, k) => ({
          at: `ready.answer[${k}]`,
          sources: part.sources,
        })),
        { at: "ready.another", sources: question.ready.another.sources },
      ].filter(({ sources }) => sources.length === 0)
      for (const { at: where } of unsourced) {
        problems.push(
          `${at}.${where}: a question about the body of work names a source for every claim`
        )
      }
    }
    if ((question.family === "decision") !== (question.source !== undefined)) {
      problems.push(
        `${at}: a decision question names its call, and no other question names one`
      )
    }
  })
  const cards = new Set<string>()
  week.cards.forEach((card, i) => {
    const at = `cards[${i}] ("${card.id}")`
    if (cards.has(card.id)) problems.push(`${at}: its id is used twice`)
    cards.add(card.id)
    const opening = isOpening(card)
    if (opening !== (card.id === OPENING_CARD)) {
      problems.push(
        `${at}: the card named "${OPENING_CARD}" is the essay's opening, and no other card is`
      )
    }
    if (opening && week.schema !== INTERVIEW_WEEK_SCHEMA) {
      problems.push(
        `${at}: a ${INTERVIEW_WEEK_SCHEMA_V1} week has no essay's opening`
      )
    }
    if (opening && i !== 0) {
      problems.push(`${at}: the essay's opening is the week's first card`)
    }
    const { min, max } = cardBounds(card)
    if (card.targetSeconds < min || card.targetSeconds > max) {
      problems.push(
        `${at}: ${opening ? "the opening" : "a card"} is read in ${min} to ${max} seconds`
      )
    }
  })
  return problems
}

/** The one door a week comes in by: its schema, then what relates its fields. */
export function readWeek(body: unknown): WeekReading {
  const parsed = InterviewWeekSchema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "the week"}: ${issue.message}`
      ),
    }
  }
  const problems = relations(parsed.data)
  return problems.length === 0
    ? { ok: true, week: parsed.data }
    : { ok: false, problems }
}

const DAY_MS = 86_400_000

/**
 * Today's question (IW8, C555): one a day, by a fixed rotation over the
 * week's questions in their order, starting Monday with the first. `day` is
 * the owner's calendar day, `YYYY-MM-DD` (`pacificDay`). Nothing carries
 * over: a day left alone leaves no trace, and the next day brings its own.
 * Null on a day outside the week.
 */
export function questionOfDay(
  week: Pick<InterviewWeek, "opens" | "questions">,
  day: string
): Question | null {
  const index = Math.round(
    (Date.parse(`${day}T00:00:00Z`) -
      Date.parse(`${week.opens.slice(0, 10)}T00:00:00Z`)) /
      DAY_MS
  )
  if (!Number.isFinite(index) || index < 0 || index > 6) return null
  return week.questions[index % week.questions.length] ?? null
}
