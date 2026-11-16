/**
 * What the model writes for an interview essay (IW6, #2937), and nothing
 * else: the judged half of each answer (`JudgedAnswerSchema`, IW3), each
 * guideline's mark, and the prose said over each scene. The company, the
 * questions, the transcripts, every measured fault and the chart are the
 * bundle's (`bundle.ts`). A take home couldn't make out takes no `answer`
 * at all: no reading and no guess (HEARD2, #3072). Every object is strict; ROUTINE.md, "What you write
 * in an essay", says what each field holds.
 */
import { JudgedAnswerSchema } from "@interview-week/lib/faults"
import { z } from "zod"

export const ESSAY_VALUES_SCHEMA = "some-ui.interview-essay-values/1"

const Said = z.string().trim().min(1)

const QuestionValuesSchema = z.strictObject({
  id: z.string(),
  question: Said,
  model: Said,
  beside: Said,
  answer: z
    .union([
      z.strictObject({
        judged: JudgedAnswerSchema,
        marks: z.array(
          z.strictObject({
            mark: z.enum(["covered", "partly", "missing"]),
            note: Said.optional(),
          })
        ),
        said: Said,
      }),
      z.strictObject({ guess: Said }),
    ])
    .optional(),
})

const ReadValuesSchema = z.strictObject({
  id: z.string(),
  card: Said,
  answer: z
    .union([
      z.strictObject({
        change: Said,
        said: Said,
      }),
      z.strictObject({ guess: Said }),
    ])
    .optional(),
})

const EssayValuesSchema = z.strictObject({
  week: z.string(),
  open: Said,
  questions: z.array(QuestionValuesSchema),
  reads: z.array(ReadValuesSchema),
  weeks: Said,
  next: z.strictObject({ said: Said, topics: z.array(Said).max(5) }),
})
export type EssayValues = z.infer<typeof EssayValuesSchema>

export const EssaysValuesSchema = z.strictObject({
  schema: z.literal(ESSAY_VALUES_SCHEMA),
  essays: z.array(EssayValuesSchema),
})
export type EssaysValues = z.infer<typeof EssaysValuesSchema>
