/**
 * What home's own record of a week says was sent (RR30, the S21's w46: home
 * held the week as final while the phone said its send "didn't reach home";
 * paulgsc/server `GET /rust-weeks/:id/record` and
 * `GET /interview-weeks/:id/record`). Asked once each time a closed week
 * opens, through the link's `keep` (LA8), sending nothing of the phone's but
 * the week's id. What counted is home's to say: the link's memory of what
 * home took (`./sent`) is lost with a new pairing.
 *
 * - `200` with `sent: { at }`: home holds a send at `at`;
 * - `200` with `sent: null`: home holds none;
 * - anything else, an unreadable body, busy or no answer: nothing heard.
 *
 * A Rust Rounds week's record also says which take each of the opening's
 * questions plays (#3269, `askRustWeekRecord`), asked in the same read each
 * time a week with an opening opens: why that is home's to say is
 * `@some-ui/rust-rounds`' `lib/week-play/opening`. A home before contract
 * epoch 25 sends no `opening`, and says nothing of it; an `opening` that
 * doesn't read leaves only it unheard.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { readAs } from "@some-ui/core-utils"
import type { HomeOpening, HomeWeekRecord } from "@some-ui/rust-rounds"
import { OPENING_UNKNOWN } from "@some-ui/rust-rounds"
import type { HomeSent } from "@some-ui/voice-capture"
import { HOME_UNKNOWN } from "@some-ui/voice-capture"
import { z } from "zod"

import { homeLink } from "./index"
import { answered } from "./while-busy"

/** The weeks home keeps a record of, by their routes' prefix. */
export type WeekRecords = "rust-weeks" | "interview-weeks"

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

/** The read of week `week`'s record, as home takes it. */
export const weekRecordPath = (of: WeekRecords, week: string): string =>
  `/${of}/${encodeURIComponent(week)}/record`

/** What home's answer says was sent. */
export function readWeekRecord(answer: HomeAnswer): HomeSent {
  if (answer.status !== 200) return HOME_UNKNOWN
  const read = readAs(Record, answer.body)
  if (read === null) return HOME_UNKNOWN
  return read.sent === null
    ? { kind: "none" }
    : { kind: "sent", at: read.sent.at }
}

/** What home's record of week `week` says was sent, asked once; never rejects. */
export async function askWeekRecord(
  of: WeekRecords,
  week: string
): Promise<HomeSent> {
  const said = await answered(
    () =>
      homeLink().keep((send) => send("GET", weekRecordPath(of, week)), {
        onItsOwn: true,
      }),
    readWeekRecord
  )
  return said.kind === "sent" || said.kind === "none" ? said : HOME_UNKNOWN
}

/** What home's answer says of a Rust Rounds week's opening (#3269). */
export function readOpening(answer: HomeAnswer): HomeOpening {
  if (answer.status !== 200) return OPENING_UNKNOWN
  const read = readAs(Opening, answer.body)
  if (read?.opening === undefined) return OPENING_UNKNOWN
  return {
    kind: "known",
    takes: read.opening.map((each) => ({ ...each, ms: each.ms ?? null })),
  }
}

const RUST_UNKNOWN: HomeWeekRecord = {
  sent: HOME_UNKNOWN,
  opening: OPENING_UNKNOWN,
}

/**
 * What home's record of Rust Rounds week `week` says was sent, and of its
 * opening, asked once; never rejects.
 */
export async function askRustWeekRecord(week: string): Promise<HomeWeekRecord> {
  const said = await answered(
    () =>
      homeLink().keep(
        (send) => send("GET", weekRecordPath("rust-weeks", week)),
        {
          onItsOwn: true,
        }
      ),
    (answer) => ({
      kind: "read" as const,
      record: { sent: readWeekRecord(answer), opening: readOpening(answer) },
    })
  )
  return said.kind === "read" ? said.record : RUST_UNKNOWN
}
