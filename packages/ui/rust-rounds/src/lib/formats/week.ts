/**
 * A week of Rust Rounds, `some-ui.rust-week/1` (RR11, paulgsc/some-ui#2686;
 * the shape the owner decided on 2026-11-07, #2231).
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
 * The schema holds the shape and its counts; `readWeek` (`lib/week-check`)
 * adds what relates one field to another (dates, ids, line widths), and is
 * the one door a week comes in by.
 */
import {
  ExpectSchema,
  ProgramSchema,
  SlugSchema,
  TextSchema,
  WhenSchema,
} from "@rust-rounds/lib/formats"
import { z } from "zod"

export const WEEK_SCHEMA = "some-ui.rust-week/1"

/** A week's id: its ISO year and week, like `2026-w46`. One week per id, never reused. */
export const WEEK_ID = /^\d{4}-w(?:0[1-9]|[1-4]\d|5[0-3])$/

/**
 * A ticket's key, as a tracker writes one: `QM-311`. Upper case on purpose:
 * a key can never be a round's or card's slug, so a note's ref naming a
 * week's ticket can't be read as one naming a card.
 */
export const TICKET_KEY = /^[A-Z][A-Z0-9]{0,5}-\d{1,6}$/

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

/** A concept a ticket touches: one row of the decay record (RR19). Its id is stable across weeks. */
const ConceptSchema = z.strictObject({
  id: SlugSchema,
  /** How the chart and the essay name it: "Borrows into a reused buffer". */
  name: TextSchema,
})
export type Concept = z.infer<typeof ConceptSchema>

const speakToCount = `a ticket has ${SPEAK_TO_MIN} or ${SPEAK_TO_MAX} speak-to points`

export const TicketSchema = z.strictObject({
  id: z
    .string()
    .regex(
      TICKET_KEY,
      "a ticket's id is a key like QM-311: capitals, a hyphen, digits"
    ),
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
  concepts: z
    .array(ConceptSchema)
    .min(1, "name every concept the ticket touches, at least one"),
})
export type Ticket = z.infer<typeof TicketSchema>

const ticketCount = `a week has ${TICKETS_MIN} to ${TICKETS_MAX} tickets`

export const WeekSchema = z.strictObject({
  schema: z.literal(WEEK_SCHEMA),
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
  sla: z
    .array(z.strictObject({ what: TextSchema, target: TextSchema }))
    .min(1, "a week states at least one SLA row"),
  tickets: z
    .array(TicketSchema)
    .min(TICKETS_MIN, ticketCount)
    .max(TICKETS_MAX, ticketCount),
  references: z
    .array(ReferenceSchema)
    .min(1, "name at least one reference the week draws on"),
  rubric: RubricSchema,
})
export type Week = z.infer<typeof WeekSchema>
