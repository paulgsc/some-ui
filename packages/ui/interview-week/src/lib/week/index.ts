/**
 * A week of mock interview, `some-ui.interview-week/1` (IW4, #2935).
 *
 * A week sets an invented company and role. It holds two flows (#2931):
 *
 * - **Questions** the owner answers in their own words, one take each, at most
 *   2 minutes. A question names its family and variant from the closed list
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
 * - **A model answer or a score.** Model answers are written after the
 *   deadline, in the essay (IW6). Every object is strict, so a field like
 *   `answer` is refused rather than ignored.
 *
 * The schema holds the shape and its counts. `readWeek` adds what relates one
 * field to another: dates, ids, and each family's variants and source.
 */
import { weekAround } from "@some-ui/core-utils"
import { z } from "zod"

export const INTERVIEW_WEEK_SCHEMA = "some-ui.interview-week/1"

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

/** How long an answer in each family should run, in seconds. A take is capped at 120 (#2931). */
export const TARGET_SECONDS: Record<Family, number> = {
  "about-yourself": 90,
  "a-time-you": 120,
  "why-this-role": 60,
  "strengths-weaknesses": 90,
  decision: 120,
}

/** A take's cap (#2931): no target runs past it. */
export const TAKE_MAX_SECONDS = 120
/** A card's read runs 1 to 2 minutes (#2935). */
export const CARD_MIN_SECONDS = 60

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

/** The recorded call (`docs/calls.json`, ST37) a decision question draws on. */
const CallSourceSchema = z.strictObject({
  kind: z.literal("call"),
  id: z.string().regex(/^C\d+$/, "a call's id, like C266"),
})

/** What a card presents: an epic, a doc, or a declared invariant (`**<ID>:` in a doc). */
const CardSourceSchema = z.discriminatedUnion("kind", [
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

const QuestionSchema = z.strictObject({
  id: IdSchema,
  family: z.enum(FAMILY_IDS),
  variant: IdSchema,
  /** The question as the interviewer asks it. */
  prompt: TextSchema,
  /** How long a good answer runs; running past it is a fault (rambling). */
  targetSeconds: z.int().positive().max(TAKE_MAX_SECONDS),
  /** What a good answer covers, for the invented role; the essay reads the answer against them. */
  guidelines: z.array(TextSchema).min(2).max(5),
  /** A decision question's call; absent on every other question. */
  source: CallSourceSchema.optional(),
})
export type Question = z.infer<typeof QuestionSchema>

const CardSchema = z.strictObject({
  id: IdSchema,
  source: CardSourceSchema,
  /** Where a read like this is given: the cue the owner reads after. */
  situation: TextSchema,
  /** Read verbatim, first person; a line break where a breath belongs. */
  script: TextSchema,
  targetSeconds: z.int().min(CARD_MIN_SECONDS).max(TAKE_MAX_SECONDS),
})
export type Card = z.infer<typeof CardSchema>

const questionCount = `a week has ${QUESTIONS_MIN} to ${QUESTIONS_MAX} questions`
const cardCount = `a week has ${CARDS_MIN} to ${CARDS_MAX} cards`

export const InterviewWeekSchema = z.strictObject({
  schema: z.literal(INTERVIEW_WEEK_SCHEMA),
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
    if ((question.family === "decision") !== (question.source !== undefined)) {
      problems.push(
        `${at}: a decision question names its call, and no other question names one`
      )
    }
  })
  const cards = new Set<string>()
  week.cards.forEach((card, i) => {
    if (cards.has(card.id))
      problems.push(`cards[${i}] ("${card.id}"): its id is used twice`)
    cards.add(card.id)
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
