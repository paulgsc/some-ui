/**
 * Home's answers on asking it to hear a take again (#3339; paulgsc/server's
 * `hear_again` act), read as Takes and Needs your attention mean them:
 * whether home hears a take again, as each read of a take carries it, and
 * what came of an ask. Pure, so every answer can be held by a test.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { readAs } from "@some-ui/core-utils"
import type { HearAgain, HearAgainAnswer } from "@some-ui/soundbites"
import { z } from "zod"

/** A time home names, as an ISO time with its offset. */
const AtSchema = z.iso.datetime({ offset: true })

/**
 * Whether home hears a take again on the owner's ask, as each take of a read
 * says it: whether it can be asked now (`open`), whether home is hearing it
 * again, when it was last asked, and when it can next be asked while home's
 * snooze runs (`nextAt`). Absent, as from a home before it, or in a shape or
 * with a time this phone can't read: none offered, never a take that reads
 * as free to ask.
 */
export const HearAgainSchema: z.ZodType<HearAgain | null> = z
  .object({
    open: z.boolean(),
    hearing: z.boolean(),
    askedAt: AtSchema.nullable(),
    nextAt: AtSchema.nullable(),
  })
  // What the contract rules out (open while hearing, or while snoozed)
  // reads as none, never as a take free to ask.
  .refine(({ open, hearing, nextAt }) => !open || (!hearing && nextAt === null))
  .transform(({ open, hearing, nextAt }) => ({
    open,
    hearing,
    askAgainAt: nextAt,
  }))
  .nullable()
  .optional()
  .catch(null)
  .transform((said) => said ?? null)

/**
 * Home's refusal while its snooze runs, by its naming `nextAt`: when it can
 * next be asked, or none where this phone can't read the time.
 */
const SnoozedSchema = z.object({
  error: z.object({
    details: z.object({
      nextAt: z
        .array(z.unknown())
        .min(1)
        .transform(([at]) => {
          const read = AtSchema.safeParse(at)
          return read.success ? read.data : null
        }),
    }),
  }),
})

/**
 * What came of an ask: `201`, or `200` for one home already took, asked.
 * `409` naming `nextAt` asked too recently, nothing written; a `409` naming
 * nothing, a take home hasn't heard a first time yet. `404` a take home
 * doesn't hold. Anything else changed nothing.
 */
export function readHearAgain(answer: HomeAnswer): HearAgainAnswer {
  if (answer.status === 200 || answer.status === 201) return { kind: "asked" }
  if (answer.status === 409) {
    const snoozed = readAs(SnoozedSchema, answer.body)
    return snoozed === null
      ? { kind: "waiting" }
      : { kind: "snoozed", askAgainAt: snoozed.error.details.nextAt }
  }
  if (answer.status === 404) return { kind: "settled" }
  return { kind: "notTaken" }
}
