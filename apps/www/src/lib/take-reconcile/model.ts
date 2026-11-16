/**
 * Home's answers for Studio's Takes › Needs your attention (HEARD3, #3075;
 * paulgsc/server#912): the takes it couldn't hear well (`GET
 * /voice-notes/attention`) and what came of an act on one (`POST
 * /voice-notes/:id/attention`), read as the page means them. Pure, so every
 * answer can be held by a test.
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
    z.object({ text: z.string() }).transform(({ text }) => text),
    z.string(),
  ])
  .nullable()
  .transform((text) => (text === null || text.trim() === "" ? null : text))

const TakeSchema = z.object({
  id: z.string().min(1),
  of: z.string().min(1),
  ref: z.string(),
  recordedAt: z.string().min(1),
  heard: HeardSchema,
  verdict: VerdictSchema,
})

const PageSchema: z.ZodType<AttentionPage> = z.object({
  takes: z.array(TakeSchema),
  total: z.number().int().nonnegative(),
})

/** What home's answer to the read says, for the page. */
export function readAttention(answer: HomeAnswer): AttentionRead {
  // A home before HEARD3 serves no such path.
  if (answer.status === 404) return { kind: "older" }
  if (answer.status !== 200) return { kind: "unreadable" }
  const page = readAs(PageSchema, answer.body)
  return page === null ? { kind: "unreadable" } : { kind: "read", page }
}

/**
 * Whether home kept an act: a `200` or `201` is kept (an act sent again
 * answers as kept); anything else changed nothing.
 */
export const readAct = (answer: HomeAnswer): ActAnswer =>
  answer.status === 200 || answer.status === 201 ? "kept" : "notTaken"

/**
 * The kinds home deletes for good (paulgsc/server `delete::SWITCHED_ON`, a
 * Studio take or an idea's spoken take), through My data's delete path
 * (LA19): one entry per kind the owner switches on (C443).
 */
const DELETABLE: ReadonlyArray<string> = ["studio"]

/** Whether the page offers Delete… on a take of kind `of`. */
export const deletesKind = (of: string): boolean => DELETABLE.includes(of)
