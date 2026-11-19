/**
 * What the model writes on a Monday (RR18, paulgsc/some-ui#2693), and nothing
 * else: the words of each essay and the content of next week's tickets. Every
 * other field of the two files is the bundle's (`bundle.ts`) or code's
 * (`finish.ts`), so the model decides nothing about their shape (LEVERS,
 * #2162).
 *
 * Per essay ticket: a best fit for each speak-to point (`bests`), what is said
 * over the question, the best fit and the comparison, the answer's reading
 * (each point covered, partly or missing, and its SOLO level) or, for a
 * silence, the guess at why, and its deep dives. A take home couldn't make
 * out takes no answer at all: no reading and no guess (HEARD2, #3072). A
 * point answered by a take of its own (RR24) takes its own reading in
 * `points`.
 */
import { TextSchema } from "@rust-rounds/lib/formats"
import { TicketV1Schema, WEEK_ID } from "@rust-rounds/lib/formats/week"
import { MARKS, SOLO_LEVELS } from "@some-ui/video-render"
import { z } from "zod"

const VALUES_SCHEMA = "some-ui.rust-monday-values/1"

/** `/2` (RR29): an essay ticket may carry the best fit of each fork (`forks`). */
const VALUES_SCHEMA_V2 = "some-ui.rust-monday-values/2"

/** As `formats/week`'s private `ConstraintIdSchema`. */
const StatedIdSchema = z.string().regex(/^[SF][1-9]\d*$/)

const TradeSchema = {
  meets: z.array(StatedIdSchema),
  breaks: z.array(StatedIdSchema),
  /** Why, in a few words: the fork scene's last column. */
  because: TextSchema.optional(),
  /** Its program doesn't build: rustc's code, and why. */
  refused: z.strictObject({ code: TextSchema, why: TextSchema }).optional(),
}

/** A fork's after-deadline best fit (RR29): ROUTINE.md's `forks`. */
const ForkValuesSchema = z.strictObject({
  fork: z.int().min(1),
  best: z.union([
    z.strictObject({ option: z.string() }),
    z.strictObject({
      hidden: z.strictObject({
        decision: TextSchema,
        why: TextSchema,
        model: z.strictObject({ id: z.string().min(1), name: TextSchema }),
        ...TradeSchema,
      }),
    }),
  ]),
  options: z.array(z.strictObject({ id: z.string(), ...TradeSchema })),
  said: TextSchema,
})
export type ForkValues = z.infer<typeof ForkValuesSchema>

const DiveValuesSchema = z.strictObject({
  /** The speak-to point it goes into, from 0. */
  point: z.int().nonnegative(),
  title: TextSchema,
  shows: z.array(TextSchema).min(1).max(5),
  code: TextSchema.optional(),
  said: TextSchema,
})

const MarkSchema = z.strictObject({
  mark: z.enum(MARKS),
  note: TextSchema.optional(),
})

const ReadingSchema = z.strictObject({
  marks: z.array(MarkSchema),
  solo: z.strictObject({
    level: z.int().min(1).max(SOLO_LEVELS.length),
    why: TextSchema,
  }),
})

const GuessSchema = z.strictObject({ guess: TextSchema })

/**
 * A speak-to point answered by a take of its own (RR24, #3248), by its place
 * from 1: its take's reading, one mark and its SOLO level; or, for a take in
 * which home heard nothing said, a guess at why. A point whose take home
 * couldn't make out takes none: leave it out.
 */
const PointValuesSchema = z.union([
  MarkSchema.extend({
    point: z.int().min(1),
    solo: ReadingSchema.shape.solo,
  }),
  GuessSchema.extend({ point: z.int().min(1) }),
])
export type PointValues = z.infer<typeof PointValuesSchema>

const EssayTicketValuesSchema = z.strictObject({
  id: z.string(),
  /** A best fit for each speak-to point, in order, made apart from the answer. */
  bests: z.array(TextSchema).min(1).max(6),
  question: TextSchema,
  best: TextSchema,
  beside: TextSchema,
  /**
   * A take's reading, or a silence's guess at why. Left out for a take home
   * couldn't make out (HEARD2): code says what is said over it.
   */
  answer: z.union([ReadingSchema, GuessSchema]).optional(),
  /** Each point the bundle says was answered by a take of its own (RR24), read on its own. */
  points: z.array(PointValuesSchema).optional(),
  /** Each fork's best fit (`/2`), for a ticket whose forks list options. */
  forks: z.array(ForkValuesSchema).optional(),
  dives: z.array(DiveValuesSchema),
})
export type EssayTicketValues = z.infer<typeof EssayTicketValuesSchema>

const EssayValuesSchema = z.strictObject({
  week: z.string().regex(WEEK_ID),
  open: TextSchema,
  tickets: z.array(EssayTicketValuesSchema),
  weeks: TextSchema,
  next: TextSchema,
})
export type EssayValues = z.infer<typeof EssayValuesSchema>

const WeekTicketValuesSchema = TicketV1Schema.extend({
  /** The pasted error it was built from, by its `at`, as the bundle's seeds name them. */
  seed: z.string().optional(),
})

const WeekValuesSchema = z.strictObject({
  company: z.strictObject({ name: TextSchema, about: TextSchema }),
  role: TextSchema,
  audience: TextSchema,
  story: TextSchema,
  sla: z.array(z.strictObject({ what: TextSchema, target: TextSchema })),
  tickets: z.array(WeekTicketValuesSchema),
})

export const ValuesSchema = z
  .strictObject({
    schema: z.enum([VALUES_SCHEMA, VALUES_SCHEMA_V2]),
    essays: z.array(EssayValuesSchema),
    /** Next week's content; null when the bundle has no `next`. */
    week: WeekValuesSchema.nullable(),
  })
  .refine(
    (values) =>
      values.schema === VALUES_SCHEMA_V2 ||
      values.essays.every((essay) =>
        essay.tickets.every((ticket) => ticket.forks === undefined)
      ),
    { message: `a fork's best fit is ${VALUES_SCHEMA_V2}'s`, path: ["schema"] }
  )
export type Values = z.infer<typeof ValuesSchema>
