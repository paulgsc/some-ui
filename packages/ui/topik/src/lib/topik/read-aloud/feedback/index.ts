/**
 * What the learner says at the end of a read-aloud sitting, in two separate
 * answers: "Too easy" asks the next pool for harder sentences, "Too many
 * repeats" for more variety. Either, both or neither; tapping one again takes
 * it back. They are kept on the phone and travel with the next reflection as a
 * field of their own. Nothing here moves the level or the draw, and nothing
 * infers an answer from a stuck report (Prop. 6.4 (iii)).
 *
 * Pure: `../../adapter/read-aloud-store` keeps it, and every word it shows is
 * in `FEEDBACK_WORDS`, which stays in the person's terms (`index.test.ts`).
 */

import { z } from "zod"

export type FeedbackKey = "tooEasy" | "tooManyRepeats"

export type ReadAloudFeedback = {
  tooEasy: boolean
  tooManyRepeats: boolean
  /** ISO. When it was last changed. */
  answeredAt: string
}

const FeedbackSchema = z.object({
  version: z.literal(1),
  tooEasy: z.boolean(),
  tooManyRepeats: z.boolean(),
  answeredAt: z.string().refine((at) => !Number.isNaN(Date.parse(at))),
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
  const { tooEasy, tooManyRepeats, answeredAt } = parsed.data
  return tooEasy || tooManyRepeats
    ? { tooEasy, tooManyRepeats, answeredAt }
    : null
}

/** The answers after tapping `key`; null once neither is given. */
export function toggled(
  current: ReadAloudFeedback | null,
  key: FeedbackKey,
  at: string
): ReadAloudFeedback | null {
  const next = {
    tooEasy: current?.tooEasy ?? false,
    tooManyRepeats: current?.tooManyRepeats ?? false,
  }
  next[key] = !next[key]
  return next.tooEasy || next.tooManyRepeats
    ? { ...next, answeredAt: at }
    : null
}

const LABEL: Record<FeedbackKey, string> = {
  tooEasy: "Too easy",
  tooManyRepeats: "Too many repeats",
}

export const FEEDBACK_WORDS = {
  /** The group's spoken name, and what the buttons answer. */
  group: "How was this sitting?",
  label: (key: FeedbackKey): string => LABEL[key],
  /** What is kept, where, and what it goes with; null when nothing is. */
  saved: (feedback: ReadAloudFeedback | null): string | null => {
    if (feedback === null) return null
    const given = (["tooEasy", "tooManyRepeats"] as const).filter(
      (key) => feedback[key]
    )
    const names = given.map((key) => LABEL[key]).join(" and ")
    return given.length === 1
      ? `Saved on this phone: ${names}. It goes with your next reflection.`
      : `Saved on this phone: ${names}. They go with your next reflection.`
  },
} as const
