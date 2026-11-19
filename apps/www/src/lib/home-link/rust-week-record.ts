/**
 * What home's own record of a Rust Rounds week says was sent (RR30, the S21's
 * w46: home held the week as final while the phone said its send "didn't
 * reach home"; paulgsc/server `GET /rust-weeks/:id/record`). Asked once each
 * time a closed week opens, through the link's `keep` (LA8), sending nothing
 * of the phone's but the week's id. What counted is home's to say: the
 * link's memory of what home took (`./sent`) is lost with a new pairing.
 *
 * - `200` with `sent: { at }`: home holds a send at `at`;
 * - `200` with `sent: null`: home holds none;
 * - anything else, an unreadable body, busy or no answer: nothing heard.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { readAs } from "@some-ui/core-utils"
import type { HomeWeekSent } from "@some-ui/rust-rounds"
import { z } from "zod"

import { homeLink } from "./index"
import { answered } from "./while-busy"

const Record = z.object({
  // Other fields home adds are let through unread.
  sent: z.object({ at: z.string() }).nullable(),
})

const UNKNOWN: HomeWeekSent = { kind: "unknown" }

/** The read of week `week`'s record, as home takes it. */
export const weekRecordPath = (week: string): string =>
  `/rust-weeks/${encodeURIComponent(week)}/record`

/** What home's answer says was sent. */
export function readWeekRecord(answer: HomeAnswer): HomeWeekSent {
  if (answer.status !== 200) return UNKNOWN
  const read = readAs(Record, answer.body)
  if (read === null) return UNKNOWN
  return read.sent === null
    ? { kind: "none" }
    : { kind: "sent", at: read.sent.at }
}

/** What home's record of week `week` says was sent, asked once; never rejects. */
export async function askWeekRecord(week: string): Promise<HomeWeekSent> {
  const said = await answered(
    () =>
      homeLink().keep((send) => send("GET", weekRecordPath(week)), {
        onItsOwn: true,
      }),
    readWeekRecord
  )
  return "kind" in said && (said.kind === "sent" || said.kind === "none")
    ? said
    : UNKNOWN
}
