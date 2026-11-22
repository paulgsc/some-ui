/**
 * Home's answers for Studio's Takes › Needs your attention (HEARD3, #3075;
 * paulgsc/server#912): the takes it couldn't hear well (`GET
 * /voice-notes/attention`) and what came of an act on one (`POST
 * /voice-notes/:id/attention`), read as the page means them. Pure, so every
 * answer can be held by a test.
 *
 * Each take says whether home hears it again on the owner's ask
 * (`lib/hear-again`, #3339).
 *
 * A verdict is read as HEARD1 serves it (paulgsc/server#908: `{kind,
 * reasons, rule, signals}`, signals in camelCase); of the signals the page
 * keeps only the languages it can say a take was heard in.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { readAs } from "@some-ui/core-utils"
import type {
  ActAnswer,
  AttentionPage,
  AttentionRead,
  TakeVerdict,
} from "@some-ui/soundbites"
import { z } from "zod"

import { HearAgainSchema } from "@/lib/hear-again/model"

/** A verdict as home serves it, read as the page says it. */
const VerdictSchema: z.ZodType<TakeVerdict> = z
  .object({
    kind: z.enum(["heard", "garbled", "nothing_said", "failed"]),
    reasons: z.array(z.string()),
    rule: z.string(),
    // Signals a newer home adds or reshapes don't make the take unreadable.
    signals: z
      .object({
        language: z.string().min(1),
        expectedLanguage: z.string().min(1).nullable().optional(),
      })
      .nullable()
      .catch(null),
  })
  .transform(({ kind, reasons, rule, signals }) => ({
    kind,
    reasons,
    rule,
    language:
      signals === null
        ? null
        : {
            heard: signals.language,
            expected: signals.expectedLanguage ?? null,
          },
  }))

/** What home heard: its words, as a transcript or as text; none as null. */
const HeardSchema = z
  .union([
    z.object({ text: z.string().nullable() }).transform(({ text }) => text),
    z.string(),
  ])
  .nullable()
  .optional()
  .transform((text) =>
    text === null || text === undefined || text.trim() === "" ? null : text
  )

const TakeSchema = z.object({
  id: z.string().min(1),
  of: z.string().min(1),
  ref: z.string(),
  recordedAt: z.string().min(1),
  heard: HeardSchema,
  verdict: VerdictSchema,
  hearAgain: HearAgainSchema,
})

/**
 * The page, each take read on its own: one this phone can't read (a verdict
 * kind a newer home adds) is left out, never the page with it, and `total`
 * still counts it.
 */
const PageSchema: z.ZodType<AttentionPage> = z
  .object({
    takes: z.array(z.unknown()),
    total: z.number().int().nonnegative(),
  })
  .transform(({ takes, total }) => ({
    takes: takes.flatMap((take) => {
      const read = TakeSchema.safeParse(take)
      return read.success ? [read.data] : []
    }),
    total,
  }))

/** What home's answer to the read says, for the page. */
export function readAttention(answer: HomeAnswer): AttentionRead {
  // A home before HEARD3 serves no such path.
  if (answer.status === 404) return { kind: "older" }
  if (answer.status !== 200) return { kind: "unreadable" }
  const page = readAs(PageSchema, answer.body)
  return page === null ? { kind: "unreadable" } : { kind: "read", page }
}

/**
 * What came of an act (server#912): `201` kept, `200` the same act already
 * kept; `409` a take with nothing to reconcile (no verdict, or heard) and
 * `404` one home doesn't hold, both settled; anything else changed nothing.
 */
export function readAct(answer: HomeAnswer): ActAnswer {
  if (answer.status === 200 || answer.status === 201) return "kept"
  if (answer.status === 404 || answer.status === 409) return "settled"
  return "notTaken"
}
