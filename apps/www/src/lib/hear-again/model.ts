/**
 * Home's answers on asking it to hear a take again (#3339), read as Takes
 * and Needs your attention mean them: whether home hears a take again, as
 * each read of a take carries it, and what came of an ask. Pure, so every
 * answer can be held by a test.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { readAs } from "@some-ui/core-utils"
import type { HearAgain, HearAgainAnswer } from "@some-ui/soundbites"
import { z } from "zod"

/** A time home names, as an ISO time; anything else as none. */
const AtSchema = z.iso.datetime({ offset: true }).nullable().catch(null)

/**
 * Whether home hears a take again on the owner's ask, and when it can next
 * be asked: absent or unreadable, as from a home before it, none.
 */
export const HearAgainSchema: z.ZodType<HearAgain | null> = z
  .object({ askAgainAt: AtSchema, hearing: z.boolean() })
  .nullable()
  .optional()
  .catch(null)
  .transform((said) => said ?? null)

const AskedSchema = z
  .object({ askAgainAt: AtSchema })
  .catch({ askAgainAt: null })

/**
 * What came of an ask: `201`, or `200` for one home already took, asked;
 * `429` asked too recently, nothing written; each with when it can next be
 * asked. `404` a take home doesn't hold and `409` one it hears nothing more
 * in, both settled; anything else changed nothing.
 */
export function readHearAgain(answer: HomeAnswer): HearAgainAnswer {
  const ok = answer.status === 200 || answer.status === 201
  if (ok || answer.status === 429) {
    const { askAgainAt } = readAs(AskedSchema, answer.body) ?? {
      askAgainAt: null,
    }
    return { kind: ok ? "asked" : "snoozed", askAgainAt }
  }
  if (answer.status === 404 || answer.status === 409) return { kind: "settled" }
  return { kind: "notTaken" }
}
