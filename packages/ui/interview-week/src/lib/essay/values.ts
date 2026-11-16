/**
 * What the model writes for an interview essay (IW6, #2937), and nothing
 * else: the judged half of each answer (`JudgedAnswerSchema`, IW3), each
 * guideline's mark, and the prose said over each scene. The company, the
 * questions, the transcripts, every measured fault and the chart are the
 * bundle's (`bundle.ts`). Every object is strict.
 */
import { JudgedAnswerSchema } from "@interview-week/lib/faults"
import { z } from "zod"

export const ESSAY_VALUES_SCHEMA = "some-ui.interview-essay-values/1"

const Said = z.string().trim().min(1)

const QuestionValuesSchema = z.strictObject({
  id: z.string(),
  /** The question and its guidelines, said. */
  question: Said,
  /** A model answer that meets the guidelines; never called correct, never a real employer. */
  model: Said,
  /** The model answer beside the owner's, guideline by guideline. */
  beside: Said,
  answer: z.union([
    z.strictObject({
      judged: JudgedAnswerSchema,
      /** One per guideline, in order. */
      marks: z.array(
        z.strictObject({
          mark: z.enum(["covered", "partly", "missing"]),
          note: Said.optional(),
        })
      ),
      /** The faults, measured and judged, said plainly. */
      said: Said,
    }),
    z.strictObject({ guess: Said }),
  ]),
})

const ReadValuesSchema = z.strictObject({
  id: z.string(),
  /** Where the read is given, said. */
  card: Said,
  answer: z.union([
    z.strictObject({
      /** One plain sentence on what to change. */
      change: Said,
      /** The measured faults and the change, said. */
      said: Said,
    }),
    z.strictObject({ guess: Said }),
  ]),
})

const EssayValuesSchema = z.strictObject({
  week: z.string(),
  open: Said,
  questions: z.array(QuestionValuesSchema),
  reads: z.array(ReadValuesSchema),
  /** What the chart shows, in plain words: counts, never a score. */
  weeks: Said,
  next: z.strictObject({ said: Said, topics: z.array(Said).max(5) }),
})
export type EssayValues = z.infer<typeof EssayValuesSchema>

export const EssaysValuesSchema = z.strictObject({
  schema: z.literal(ESSAY_VALUES_SCHEMA),
  essays: z.array(EssayValuesSchema),
})
export type EssaysValues = z.infer<typeof EssaysValuesSchema>
