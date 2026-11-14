/**
 * What the model writes on a Monday for the interview week (IW4, #2935), and
 * nothing else: the invented company and role, each question's prompt and
 * guidelines, and each card's script. Ids, families, sources, situations,
 * dates and targets are the bundle's (`bundle.ts`), so the model decides
 * nothing about the week's shape (LEVERS, #2162). Every object is strict.
 */
import { TextSchema } from "@interview-week/lib/week"
import { z } from "zod"

export const VALUES_SCHEMA = "some-ui.interview-monday-values/1"

const WeekValuesSchema = z.strictObject({
  company: z.strictObject({ name: TextSchema, about: TextSchema }),
  role: z.strictObject({ title: TextSchema, about: TextSchema }),
  questions: z.array(
    z.strictObject({
      id: z.string(),
      prompt: TextSchema,
      guidelines: z.array(TextSchema),
    })
  ),
  cards: z.array(z.strictObject({ id: z.string(), script: TextSchema })),
})
export type WeekValues = z.infer<typeof WeekValuesSchema>

export const ValuesSchema = z.strictObject({
  schema: z.literal(VALUES_SCHEMA),
  /** Next week's words; null when the bundle's `next` is null. */
  week: WeekValuesSchema.nullable(),
})
export type Values = z.infer<typeof ValuesSchema>
