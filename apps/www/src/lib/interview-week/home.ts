/**
 * The interview week's exchange with home (IW5; home's half is
 * paulgsc/server#847, `handlers/interview_weeks.rs`), pure over a `HomeCall`
 * and what this phone keeps (`./store`). apps/www's interview lane
 * (`lib/home-link/interview.ts`) runs it.
 *
 * - **The weeks** (`exchangeInterviewWeeks`): `GET /interview-weeks`, then
 *   each week this phone lacks, newest first, at most
 *   `WEEK_READS_PER_EXCHANGE` a run, through `readWeek`
 *   (`@some-ui/interview-week`), the one door a week comes in by. A week is
 *   the routine's: the phone never writes one. The first copy read of an id
 *   is the one kept; a week the phone can't read is not read again.
 * - **The sends** (`interviewGoing`): the latest send of each week, to
 *   `PUT /interview-weeks/:id/sent`, known by its `at` (`./spec`'s
 *   `sendKey`). Home keeps it as the week's draft, and the draft standing at
 *   the deadline is final. Nothing goes once the week's deadline has passed
 *   on this phone's clock, since home refuses it then. Earlier sends stay on
 *   this phone and go nowhere.
 */
import type { HomeCall, HomeExchanged, KeyedStorage } from "@some-ui/core-utils"
import { readAs, unexpectedAnswer } from "@some-ui/core-utils"
import { readWeek } from "@some-ui/interview-week"
import { z } from "zod"

import type { InterviewSent } from "./spec"
import { isClosed, latestSend, sendKey } from "./spec"
import type { HeldInterview, InterviewsHeld, InterviewsStore } from "./store"
import { heldWeeks, interviewSent } from "./store"

const WEEKS_PATH = "/interview-weeks"

const weekPath = (id: string): string =>
  `${WEEKS_PATH}/${encodeURIComponent(id)}`

/** How many weeks one exchange reads from home, at most. */
const WEEK_READS_PER_EXCHANGE = 4

/** The week this phone holds under `id`, if it holds one. */
const heldInterview = (
  held: InterviewsHeld,
  id: string
): HeldInterview | null =>
  held.weeks.find((each) => each.week.id === id) ?? null

const ListSchema = z.object({
  weeks: z.array(z.object({ id: z.string(), sha256: z.string() })),
})

const WeekSchema = z.object({
  id: z.string(),
  sha256: z.string(),
  week: z.unknown(),
})

const FORGOTTEN: HomeExchanged = { kind: "forgotten" }

/** One exchange through `send`: the weeks home holds that this phone lacks come back. */
export async function exchangeInterviewWeeks(
  store: InterviewsStore,
  send: HomeCall
): Promise<HomeExchanged> {
  const list = await send("GET", WEEKS_PATH)
  if (list.status === 401) return FORGOTTEN
  if (list.status !== 200) {
    return unexpectedAnswer("the interview weeks", list.status)
  }
  const listed = readAs(ListSchema, list.body)
  if (listed === null) {
    return { kind: "failed", why: "the interview weeks: unreadable" }
  }
  const held = store.held()
  const toRead = listed.weeks
    .filter(
      ({ id, sha256 }) =>
        !held.unread.includes(`${id}@${sha256}`) &&
        heldInterview(held, id) === null
    )
    .slice(0, WEEK_READS_PER_EXCHANGE)

  let failed: number | null = null
  for (const { id, sha256 } of toRead) {
    const answer = await send("GET", weekPath(id))
    if (answer.status === 401) return FORGOTTEN
    if (answer.status === 404) continue
    if (answer.status !== 200) {
      failed ??= answer.status
      continue
    }
    const from = readAs(WeekSchema, answer.body)
    const reading = from === null ? null : readWeek(from.week)
    const now = store.held()
    if (heldInterview(now, id) !== null) continue
    const next: InterviewsHeld =
      from !== null && reading?.ok === true && reading.week.id === id
        ? {
            ...now,
            weeks: [...now.weeks, { week: reading.week, sha256: from.sha256 }],
          }
        : { ...now, unread: [...now.unread, `${id}@${sha256}`] }
    if (!store.hold(next)) return { kind: "failed", why: "fault" }
  }
  return failed === null
    ? { kind: "synced" }
    : unexpectedAnswer("an interview week", failed)
}

/** A send that goes home: where, and the body it goes as. */
export type InterviewGoing = {
  /** `sendKey`: the week and when it was sent. */
  readonly id: string
  readonly path: string
  readonly wire: InterviewSent
}

/** The latest send of each week still open at `at` (milliseconds since the epoch). */
export function interviewGoing(
  storage: KeyedStorage | null,
  at: number
): Array<InterviewGoing> {
  const sends = interviewSent(storage).list() ?? []
  const held = heldWeeks(storage).held()
  const now = new Date(at).toISOString()
  return [...new Set(sends.map(({ week }) => week))]
    .flatMap((id) => {
      const sent = latestSend(sends.filter(({ week }) => week === id))
      return sent === null ? [] : [sent]
    })
    .filter((sent) => {
      const of = heldInterview(held, sent.week)
      return of === null || !isClosed(of.week, now)
    })
    .map((sent) => ({
      id: sendKey(sent),
      path: `${weekPath(sent.week)}/sent`,
      wire: sent,
    }))
}
