/**
 * A week of Rust Rounds: `some-ui.rust-week/1` (RR11, paulgsc/some-ui#2686;
 * the shape the owner decided on 2026-11-07, #2231) and `/2` (RR25, RR29:
 * #3249, #3257; the owner approved its screens on 2026-11-19, C690, C698).
 *
 * A week is a performance task laid out by GRASPS (Wiggins & McTighe,
 * _Understanding by Design_):
 *
 * - **Goal:** the SLA rows (`sla`).
 * - **Role:** who the owner plays (`role`).
 * - **Audience:** who the work is for (`audience`).
 * - **Situation:** an invented company (`company`) and its user story (`story`).
 * - **Product:** the owner's spoken guide, one take per ticket. It is never in
 *   this file: home keeps it (RR14).
 * - **Standards:** each ticket's speak-to points (`speakTo`), judged by SOLO
 *   (`rubric`) against the named references (`references`).
 *
 * Each ticket is a constructed response, spoken: its program compiles but
 * misses the SLA, doesn't compile, or fails only in some situations. Never
 * trivia.
 *
 * What the file never holds, by design:
 *
 * - **A best fit.** It is written after the deadline (RR18), so nothing on
 *   the phone can show one early. Every object is strict, so a `bestFit`, a
 *   `correct` or a score is refused rather than ignored.
 * - **A measurement.** A ticket's `figures` are the scenario's, stated as
 *   given facts as an assessment states them. Nothing on home measures speed.
 * - **A real company's name.** Weeks are published; the company is invented.
 *   No check can tell a real name from an invented one, so the routine's
 *   instructions carry that rule.
 *
 * `expect` on a ticket judges the tutor's draft against home's recording,
 * never the owner, and nothing on the phone shows it.
 *
 * **`/2` makes each ticket a set of decisions** (RR29). Its speak-to points
 * become forks: each a question with 2 to 6 options as an agent would
 * recommend them, exactly one marked recommended, honest and wrong only by
 * the model it rests on. Every option cites the stated constraints it
 * trades on, by id (`S1` for an SLA row, `F1` for a figure), so a judgement
 * can be held to what the week said and nothing else (C696). Each ticket
 * also carries its academy (RR25): exercises the owner works at the
 * scratchpad, each naming the forks it builds toward, the options whose
 * models it tests and the words it works on, with a starter `main.rs` and
 * what home's rustc must make of it (`expect`), never shown on the phone
 * (C672). Which option is best, listed or not, is written only after the
 * deadline (RR18).
 *
 * Three shapes, one door:
 *
 * - `WeekV1Schema` and `WeekV2Schema` are the two files.
 * - `WeekSchema` is a week as the phone holds it: `/2`'s shape, which a `/1`
 *   week fits by `upgradeWeek` (generated ids, forks with no options, no
 *   academy), so every week the phone or home already holds still reads.
 *
 * The schemas hold the shape and its counts; `readWeek` (`lib/week-check`)
 * adds what relates one field to another (dates, ids, line widths, what an
 * option cites and an exercise tests), and is the one door a week comes in
 * by.
 */
import {
  ExpectSchema,
  ProgramSchema,
  SlugSchema,
  TextSchema,
  WhenSchema,
} from "@rust-rounds/lib/formats"
import { CONVERSATION_MOST } from "@some-ui/video-render"
import { z } from "zod"

import { WEEK_ID } from "./week-id"

export { WEEK_ID } from "./week-id"

/** The schema the routine writes: home reads `/1` alone until it reads `/2` too. */
export const WEEK_SCHEMA = "some-ui.rust-week/1"

/** The week with forks and an academy (RR25, RR29). */
export const WEEK_SCHEMA_V2 = "some-ui.rust-week/2"

/**
 * A ticket's key, as a tracker writes one: `QM-311`. Upper case on purpose:
 * a key can never be a round's or card's slug, so a note's ref naming a
 * week's ticket can't be read as one naming a card.
 */
export const TICKET_KEY = /^[A-Z][A-Z0-9]{0,5}-\d{1,6}$/

/** A stated constraint's id with the given prefix: `S1`, `F2`. */
const constraintId = (prefix: string): RegExp =>
  new RegExp(`^${prefix}[1-9]\\d*$`)

/** An option's id within its fork: `A` to `F`. */
const OptionIdSchema = z
  .string()
  .regex(/^[A-F]$/, "an option's id is a capital, A to F")

/** The references a week draws on, the known space "right" is checked against. */
export const ReferenceSchema = z.enum([
  "rust-reference",
  "rustonomicon",
  "async-book",
  "ownership-inventory",
])
export type Reference = z.infer<typeof ReferenceSchema>

/** Each reference by its full name, as the essay cites it. */
export const REFERENCES: Record<Reference, string> = {
  "rust-reference": "The Rust Reference",
  rustonomicon: "The Rustonomicon",
  "async-book": "Asynchronous Programming in Rust (the Async Book)",
  "ownership-inventory":
    "The Ownership Inventory (Crichton, Gray & Krishnamurthi, OOPSLA 2023)",
}

const RubricSchema = z.enum(["solo"])

/** The rubric every week is judged by, as the essay cites it. */
export const RUBRIC: Record<z.infer<typeof RubricSchema>, string> = {
  solo: "SOLO (Biggs & Collis, 1982), as applied to explaining code by Lister et al., ITiCSE 2006",
}

const SPEAK_TO_MIN = 2
const SPEAK_TO_MAX = 3
const TICKETS_MIN = 2
const TICKETS_MAX = 4
const FORKS_MIN = 1
const FORKS_MAX = 6
const OPTIONS_MIN = 2
const OPTIONS_MAX = 6
const ACADEMY_MIN = 1
const ACADEMY_MAX = 8

/** A concept a ticket touches: one row of the decay record (RR19). Its id is stable across weeks. */
const ConceptSchema = z.strictObject({
  id: SlugSchema,
  /** How the chart and the essay name it: "Borrows into a reused buffer". */
  name: TextSchema,
})
export type Concept = z.infer<typeof ConceptSchema>

const KeySchema = z
  .string()
  .regex(
    TICKET_KEY,
    "a ticket's id is a key like QM-311: capitals, a hyphen, digits"
  )

const conceptsOf = z
  .array(ConceptSchema)
  .min(1, "name every concept the ticket touches, at least one")

const speakToCount = `a ticket has ${SPEAK_TO_MIN} or ${SPEAK_TO_MAX} speak-to points`

/** A `/1` ticket. */
export const TicketV1Schema = z.strictObject({
  id: KeySchema,
  title: TextSchema,
  /** What the ticket asks, in the scenario's terms. */
  spec: TextSchema,
  /** Figures the scenario states as given (a latency, a rate); never measured. */
  figures: z.array(TextSchema),
  /** The closed space the owner's guide covers, in order; also the rows of the essay's comparison. */
  speakTo: z
    .array(TextSchema)
    .min(SPEAK_TO_MIN, speakToCount)
    .max(SPEAK_TO_MAX, speakToCount),
  program: ProgramSchema,
  /** The tutor's guess at what rustc does with `program`. */
  expect: ExpectSchema,
  concepts: conceptsOf,
})

const ConstraintIdSchema = z
  .string()
  .regex(
    constraintId("[SF]"),
    "a constraint's id is S1 for an SLA row or F1 for a figure"
  )

/** An SLA row, with the id options and judgements cite it by. */
const SlaRowSchema = z.strictObject({
  id: z.string().regex(constraintId("S"), "an SLA row's id is S1, S2, …"),
  what: TextSchema,
  target: TextSchema,
})

/** A figure the scenario states as given, never measured, with its id. */
const FigureSchema = z.strictObject({
  id: z.string().regex(constraintId("F"), "a figure's id is F1, F2, …"),
  text: TextSchema,
})

/** One option at a fork, as an agent recommends it (RR29, C692). */
const OptionSchema = z.strictObject({
  id: OptionIdSchema,
  /** Exactly one option of a fork is the agent's recommendation. */
  recommended: z.boolean(),
  /** What the agent would do. */
  decision: TextSchema,
  /** Its case, honestly argued. */
  why: TextSchema,
  /** The model of Rust it rests on. */
  model: z.strictObject({ id: SlugSchema, name: TextSchema }),
  /** The stated constraints it trades on, by id. */
  cites: z
    .array(ConstraintIdSchema)
    .min(1, "an option cites at least one stated constraint, by id"),
})
export type ForkOption = z.infer<typeof OptionSchema>

const optionCount = `a fork has ${OPTIONS_MIN} to ${OPTIONS_MAX} options`

/** A fork in a `/2` file: its question and the agent's options. */
const ForkSchema = z.strictObject({
  question: TextSchema,
  options: z
    .array(OptionSchema)
    .min(OPTIONS_MIN, optionCount)
    .max(OPTIONS_MAX, optionCount),
})

/** A fork as the phone holds it: a `/1` speak-to point is a fork with no options. */
const HeldForkSchema = ForkSchema.extend({
  options: z.array(OptionSchema).max(OPTIONS_MAX, optionCount),
})

/** A fork, 1-based as the screen and a take's ref count them. */
const ForkNumberSchema = z.int().min(1, "forks are counted from 1")

/** One exercise of a ticket's academy (RR25, C671, C694). */
const ExerciseSchema = z.strictObject({
  title: TextSchema,
  /** The motivating line. */
  why: TextSchema,
  /** The forks it builds toward, from 1. */
  forks: z
    .array(ForkNumberSchema)
    .min(1, "an exercise builds toward at least one fork"),
  /** The options whose models it tests; never whether one is right. */
  tests: z
    .array(
      z.strictObject({
        fork: ForkNumberSchema,
        option: OptionIdSchema,
      })
    )
    .min(1, "an exercise tests at least one option's model"),
  /** The words it works on. */
  keywords: z
    .array(TextSchema)
    .min(1, "an exercise names at least one word it works on"),
  /** A whole `main.rs`, read at the desk, so not held to the phone's columns. */
  starter: ProgramSchema,
  /** What to try with it, in order. */
  tries: z.array(TextSchema).min(1, "an exercise has at least one step to try"),
  /** Questions to have clarity on. */
  clarity: z
    .array(TextSchema)
    .min(1, "an exercise asks at least one question to have clarity on"),
  /** What home's rustc must make of the starter; never shown on the phone (C672). */
  expect: ExpectSchema,
})
export type Exercise = z.infer<typeof ExerciseSchema>

const forkCount = `a ticket has ${FORKS_MIN} to ${FORKS_MAX} forks`
const academyCount = `a ticket's academy has ${ACADEMY_MIN} to ${ACADEMY_MAX} exercises`

/** A `/2` ticket. */
const TicketV2Schema = z.strictObject({
  id: KeySchema,
  title: TextSchema,
  spec: TextSchema,
  figures: z.array(FigureSchema),
  /** The speak-to points, each a fork the owner decides (C691). */
  forks: z
    .array(ForkSchema)
    .min(FORKS_MIN, forkCount)
    .max(FORKS_MAX, forkCount),
  program: ProgramSchema,
  expect: ExpectSchema,
  concepts: conceptsOf,
  academy: z
    .array(ExerciseSchema)
    .min(ACADEMY_MIN, academyCount)
    .max(ACADEMY_MAX, academyCount),
})

/** A ticket as the phone holds it: `/2`'s shape, which a `/1` ticket fits too. */
const TicketSchema = TicketV2Schema.extend({
  forks: z
    .array(HeldForkSchema)
    .min(FORKS_MIN, forkCount)
    .max(FORKS_MAX, forkCount),
  academy: z.array(ExerciseSchema).max(ACADEMY_MAX, academyCount),
})
export type Ticket = z.infer<typeof TicketSchema>

const ticketCount = `a week has ${TICKETS_MIN} to ${TICKETS_MAX} tickets`

const weekFields = {
  id: z
    .string()
    .regex(WEEK_ID, "a week's id is its ISO year and week, like 2026-w46"),
  /** Which tutor wrote it: `claude-routine`, … */
  by: TextSchema,
  /** The exercise family. Only the performance task exists; others come later in the same frame. */
  family: z.literal("performance-task"),
  /** When the week opens: Monday 00:00, the owner's time. */
  opens: WhenSchema,
  /** The deadline: Sunday 23:59, the owner's time. A take not sent by then doesn't count. */
  due: WhenSchema,
  company: z.strictObject({
    /** Invented: never a real company's name. */
    name: TextSchema,
    /** What it does, in a sentence or two. */
    about: TextSchema,
  }),
  role: TextSchema,
  audience: TextSchema,
  /** The user story the SLA comes from. */
  story: TextSchema,
  references: z
    .array(ReferenceSchema)
    .min(1, "name at least one reference the week draws on"),
  rubric: RubricSchema,
}

/** A `/1` week. */
export const WeekV1Schema = z.strictObject({
  schema: z.literal(WEEK_SCHEMA),
  ...weekFields,
  sla: z
    .array(z.strictObject({ what: TextSchema, target: TextSchema }))
    .min(1, "a week states at least one SLA row"),
  tickets: z
    .array(TicketV1Schema)
    .min(TICKETS_MIN, ticketCount)
    .max(TICKETS_MAX, ticketCount),
})
export type WeekV1 = z.infer<typeof WeekV1Schema>

/**
 * The essay's opening, a conversation (#3269, C738): one to three
 * questions someone who has never seen Rust Rounds would ask, each with the
 * answer the owner reads through the teleprompter. It is the standing set
 * (`@rust-rounds/lib/opening`, C737), copied into the week as it stands:
 * the routine never writes it. `version` is the set's, so a take recorded
 * under one version answers that version's words, and plays only while the
 * week's opening is the same version (C736).
 */
const OpeningSchema = z.strictObject({
  version: z.int().positive(),
  exchanges: z
    .array(z.strictObject({ ask: TextSchema, script: TextSchema }))
    .min(1)
    .max(CONVERSATION_MOST),
})
export type Opening = z.infer<typeof OpeningSchema>

/** A `/2` week. */
export const WeekV2Schema = z.strictObject({
  schema: z.literal(WEEK_SCHEMA_V2),
  ...weekFields,
  /** Optional: a week with none opens on its tickets, and its essay as before. */
  opening: OpeningSchema.optional(),
  sla: z.array(SlaRowSchema).min(1, "a week states at least one SLA row"),
  tickets: z
    .array(TicketV2Schema)
    .min(TICKETS_MIN, ticketCount)
    .max(TICKETS_MAX, ticketCount),
})
export type WeekV2 = z.infer<typeof WeekV2Schema>

/** A week as the phone holds it, whichever schema it came in. */
export const WeekSchema = z.strictObject({
  /** The schema it came in; a `/1` week's forks have no options and it has no academy. */
  schema: z.enum([WEEK_SCHEMA, WEEK_SCHEMA_V2]),
  ...weekFields,
  opening: OpeningSchema.optional(),
  sla: z.array(SlaRowSchema).min(1, "a week states at least one SLA row"),
  tickets: z
    .array(TicketSchema)
    .min(TICKETS_MIN, ticketCount)
    .max(TICKETS_MAX, ticketCount),
})
export type Week = z.infer<typeof WeekSchema>

/**
 * A `/1` week in the shape the phone holds: SLA rows `S1…` and figures
 * `F1…` in the order written (figures counted across the week, so each id
 * names one), each speak-to point a fork with no options, and no academy.
 */
export function upgradeWeek(week: WeekV1): Week {
  let figure = 0
  return {
    ...week,
    sla: week.sla.map((row, i) => ({ id: `S${i + 1}`, ...row })),
    tickets: week.tickets.map(({ speakTo, figures, ...ticket }) => ({
      ...ticket,
      figures: figures.map((text) => {
        figure += 1
        return { id: `F${figure}`, text }
      }),
      forks: speakTo.map((question) => ({ question, options: [] })),
      academy: [],
    })),
  }
}
