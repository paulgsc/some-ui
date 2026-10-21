/**
 * What the learner says at the end of a read-aloud sitting, in two separate
 * answers: "Too easy" asks for harder sentences, "Too many repeats" for more
 * variety. Nothing here moves the level or the draw, and no answer is inferred
 * from a stuck report (Prop. 6.4 (iii)).
 *
 * Every word it shows is in `FEEDBACK_WORDS` (`index.test.ts`).
 */

import { z } from "zod"

export const FEEDBACK_KEYS = ["tooEasy", "tooManyRepeats"] as const

export type FeedbackKey = (typeof FEEDBACK_KEYS)[number]

/** An answer given, and when (ISO). */
type Answer = { at: string }

export type ReadAloudFeedback = Record<FeedbackKey, Answer | null>

const AnswerSchema = z.object({ at: z.iso.datetime() }).nullable()

const FeedbackSchema = z.object({
  version: z.literal(1),
  tooEasy: AnswerSchema,
  tooManyRepeats: AnswerSchema,
})

/** What is kept for the answers; null when neither is given. */
export function storedFeedback(
  feedback: ReadAloudFeedback | null
): z.infer<typeof FeedbackSchema> | null {
  return feedback && { version: 1, ...feedback }
}

/** The answers in a stored document, or null: parsed, not trusted. */
export function parseFeedback(raw: unknown): ReadAloudFeedback | null {
  const parsed = FeedbackSchema.safeParse(raw)
  if (!parsed.success) return null
  const { tooEasy, tooManyRepeats } = parsed.data
  return tooEasy || tooManyRepeats ? { tooEasy, tooManyRepeats } : null
}

/** The answers after tapping `key`; null once neither is given. */
export function toggled(
  current: ReadAloudFeedback | null,
  key: FeedbackKey,
  at: string
): ReadAloudFeedback | null {
  const next: ReadAloudFeedback = {
    tooEasy: current?.tooEasy ?? null,
    tooManyRepeats: current?.tooManyRepeats ?? null,
  }
  next[key] = next[key] ? null : { at }
  return next.tooEasy || next.tooManyRepeats ? next : null
}

const LABEL: Record<FeedbackKey, string> = {
  tooEasy: "Too easy",
  tooManyRepeats: "Too many repeats",
}

export const FEEDBACK_WORDS = {
  /** The buttons' spoken group name. */
  group: "About the sentences",
  label: (key: FeedbackKey): string => LABEL[key],
  saved: (feedback: ReadAloudFeedback | null): string | null => {
    const given = FEEDBACK_KEYS.filter((key) => feedback?.[key])
    if (given.length === 0) return null
    const names = given.map((key) => LABEL[key]).join(" and ")
    return given.length === 1
      ? `Saved on this phone: ${names}. It goes with your next reflection.`
      : `Saved on this phone: ${names}. They go with your next reflection.`
  },
  notKept: "This phone couldn't keep that.",
} as const
