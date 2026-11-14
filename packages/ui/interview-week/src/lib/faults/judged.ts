import { z } from "zod"

/**
 * The judged half of an answer's faults: the schema the model fills and this
 * module only types (LEVERS, #2162). The model points at what it judged, with
 * a short quote of the answer; anything counted from it is counted by code.
 */

/** How much of one part the answer gave. */
const PartMarkSchema = z.enum(["covered", "partly", "missing"])
export type PartMark = z.infer<typeof PartMarkSchema>

/** A quote of the answer, a few words long, that shows the mark. */
const Quote = z.string().trim().min(1).max(280)

/** One judged part: its mark, and the quote that shows it unless missing. */
const JudgedPartSchema = z
  .object({ mark: PartMarkSchema, quote: Quote.nullable() })
  .refine((part) => (part.mark === "missing") === (part.quote === null), {
    message: "a missing part quotes nothing; any other quotes the answer",
  })
export type JudgedPart = z.infer<typeof JudgedPartSchema>

/** STAR: the situation, the task, the action taken and its result. */
const StarSchema = z.object({
  situation: JudgedPartSchema,
  task: JudgedPartSchema,
  action: JudgedPartSchema,
  result: JudgedPartSchema,
})

/**
 * How a decision was explained, for a question drawn from a PR or a recorded
 * call: the options it named, why the one chosen was, the trade-off it took,
 * and what would undo it.
 */
const DecisionSchema = z.object({
  options: z.array(Quote).max(12),
  why: JudgedPartSchema,
  tradeOff: JudgedPartSchema,
  undo: JudgedPartSchema,
})

export const JudgedAnswerSchema = z.object({
  star: StarSchema,
  /** Each hedge in the answer ("I think maybe", "sort of"), quoted. */
  hedges: z.array(Quote).max(100),
  /** Null unless the question asked about a decision. */
  decision: DecisionSchema.nullable(),
})
export type JudgedAnswer = z.infer<typeof JudgedAnswerSchema>
