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
 * silence, the guess at why, and two deep dives.
 */
import { TextSchema } from "@rust-rounds/lib/formats"
import { TicketSchema, WEEK_ID } from "@rust-rounds/lib/formats/week"
import { MARKS, SOLO_LEVELS } from "@some-ui/video-render"
import { z } from "zod"

const VALUES_SCHEMA = "some-ui.rust-monday-values/1"

const DiveValuesSchema = z.strictObject({
  /** The speak-to point it goes into, from 0. */
  point: z.int().nonnegative(),
  title: TextSchema,
  shows: z.array(TextSchema).min(1).max(5),
  code: TextSchema.optional(),
  said: TextSchema,
})

const ReadingSchema = z.strictObject({
  marks: z.array(
    z.strictObject({ mark: z.enum(MARKS), note: TextSchema.optional() })
  ),
  solo: z.strictObject({
    level: z.int().min(1).max(SOLO_LEVELS.length),
    why: TextSchema,
  }),
})

const GuessSchema = z.strictObject({ guess: TextSchema })

const EssayTicketValuesSchema = z.strictObject({
  id: z.string(),
  /** A best fit for each speak-to point, in order, made apart from the answer. */
  bests: z.array(TextSchema).min(2).max(3),
  question: TextSchema,
  best: TextSchema,
  beside: TextSchema,
  /** A take's reading, or a silence's guess at why. */
  answer: z.union([ReadingSchema, GuessSchema]),
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

const WeekTicketValuesSchema = TicketSchema.extend({
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

export const ValuesSchema = z.strictObject({
  schema: z.literal(VALUES_SCHEMA),
  essays: z.array(EssayValuesSchema),
  /** Next week's content; null when the bundle has no `next`. */
  week: WeekValuesSchema.nullable(),
})
export type Values = z.infer<typeof ValuesSchema>
