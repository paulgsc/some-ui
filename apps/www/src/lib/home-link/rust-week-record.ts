/**
 * What home's own record of a Rust Rounds week says (paulgsc/server
 * `GET /rust-weeks/:id/record`): what was sent (RR30) and which take each of
 * the opening's questions plays (#3269), asked through the link's `keep`
 * (LA8), sending nothing of the phone's but the week's id. Why it is home's
 * to say is `@some-ui/rust-rounds`' `lib/week-play/opening`.
 *
 * - `sent`: `{ at }`, home holds a send at `at`; `null`, none;
 * - `opening`: for each question, the take home plays; a home before
 *   contract epoch 25 sends none, and says nothing of it;
 * - anything else, an unreadable body, busy or no answer: nothing heard of
 *   either. An `opening` that doesn't read leaves only it unheard.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { readAs } from "@some-ui/core-utils"
import type { HomeWeekRecord } from "@some-ui/rust-rounds"
import { HOME_UNKNOWN, OPENING_UNKNOWN } from "@some-ui/rust-rounds"
import { z } from "zod"

import { homeLink } from "./index"
import { answered } from "./while-busy"

const Record = z.object({
  // Other fields home adds are let through unread.
  sent: z.object({ at: z.string() }).nullable(),
})

const Opening = z.object({
  opening: z
    .array(
      z.object({
        n: z.number().int().min(1),
        take: z.string(),
        recordedAt: z.string(),
        week: z.string(),
        version: z.number().int().positive(),
        ms: z.number().nonnegative().nullish(),
      })
    )
    .optional(),
})

const UNKNOWN: HomeWeekRecord = { sent: HOME_UNKNOWN, opening: OPENING_UNKNOWN }

/** The read of week `week`'s record, as home takes it. */
export const weekRecordPath = (week: string): string =>
  `/rust-weeks/${encodeURIComponent(week)}/record`

/** What home's answer says was sent, and of the opening. */
export function readWeekRecord(answer: HomeAnswer): HomeWeekRecord {
  if (answer.status !== 200) return UNKNOWN
  const read = readAs(Record, answer.body)
  if (read === null) return UNKNOWN
  const opening = readAs(Opening, answer.body)
  return {
    sent:
      read.sent === null
        ? { kind: "none" }
        : { kind: "sent", at: read.sent.at },
    opening:
      opening?.opening === undefined
        ? OPENING_UNKNOWN
        : {
            kind: "known",
            takes: opening.opening.map((each) => ({
              ...each,
              ms: each.ms ?? null,
            })),
          },
  }
}

/** What home's record of week `week` says, asked once; never rejects. */
export async function askWeekRecord(week: string): Promise<HomeWeekRecord> {
  const said = await answered(
    () =>
      homeLink().keep((send) => send("GET", weekRecordPath(week)), {
        onItsOwn: true,
      }),
    (answer) => ({ kind: "read" as const, record: readWeekRecord(answer) })
  )
  return said.kind === "read" ? said.record : UNKNOWN
}
