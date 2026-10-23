/**
 * One exchange with home for the Jobs record kept on home: every event home
 * does not hold yet sent, then, on a phone with no log, home's record read
 * back, then the digests home holds that the phone does not. Over a `send`
 * port the app's home link hands in (`lib/home-link/jobs`), so this module
 * makes no request of its own. The routes are paulgsc/server's
 * `routes/jobs.rs`.
 *
 * Home's copy is a copy: the phone keeps its whole log either way, since its
 * shares count events by their place in it. In order:
 *
 * 1. each event in `homeOutbox`, once (`PUT /jobs/events/:id`, the event as
 *    the body). Home answers with the event it holds; a `409` (another event
 *    under that id) or a `422` (an event it won't take, with why) is a
 *    refusal, kept on the phone and not sent again; a `409` saying this
 *    phone stopped sending it (`stoppedOnHome`) refuses nothing and ends
 *    the exchange;
 * 2. home's whole record (`GET /jobs`), asked for only by a phone whose own
 *    log is empty, the one that takes it in: a reinstalled phone gets its
 *    record back;
 * 3. home's digests (`GET /jobs/digests`), the days after the newest one the
 *    phone holds (the newest few, on a phone holding none): the morning
 *    run's picks, which home takes from the mailbox. At most
 *    `DIGESTS_PER_RUN` are taken in (`fetched` decides which are kept). A
 *    digest the phone can't read is skipped and the rest are taken.
 *
 * What an exchange learned is handed over as it ends, however it ends: a
 * throw part way (a stop, no answer) keeps what home already confirmed.
 */
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"
import {
  readAs,
  refusalOf,
  stoppedOnHome,
  unexpectedAnswer,
} from "@some-ui/core-utils"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import type { Digest } from "@some-ui/job-desk"
import { DigestSchema } from "@some-ui/job-desk"
import { z } from "zod"

import type { HomeRefusal, JobEvent, JobsState } from "./model"
import { DIGESTS_PER_RUN, homeOutbox, newestDay } from "./model"
import { EventSchema } from "./stored"

/** The record an exchange reads and the answers it hands back. */
export type JobsRecordPort = {
  state: () => JobsState
  answered: (
    held: ReadonlyArray<string>,
    refused: ReadonlyArray<HomeRefusal>
  ) => void
  /** Home's copy, for a phone whose log is empty; false if not taken. */
  restored: (events: ReadonlyArray<JobEvent>) => boolean
  /** Digests home holds, for the record to take in. */
  fetched: (digests: ReadonlyArray<Digest>) => void
}

const EventAnswer = z.object({ event: z.object({ id: z.string() }) })
const HeldSchema = z.object({ events: z.array(EventSchema) })
/** Each digest is read by job-desk's own parser, not by this schema. */
const DigestsAnswer = z.object({
  digests: z.array(z.object({ day: z.iso.date(), digest: z.unknown() })),
})
type Learned = { held: Array<string>; refused: Array<HomeRefusal> }

/** Step 1. Null when every event is dealt with and the exchange goes on. */
async function sendEvents(
  keeping: JobsRecordPort,
  send: HomeCall,
  learned: Learned
): Promise<HomeExchanged | null> {
  for (const event of homeOutbox(keeping.state())) {
    const answer = await send(
      "PUT",
      `/jobs/events/${encodeURIComponent(event.id)}`,
      JSON.stringify(event)
    )
    if (answer.status === 401) return { kind: "forgotten" }
    // Home heard a stop this phone's log no longer holds: nothing is refused.
    if (stoppedOnHome(answer)) {
      return unexpectedAnswer("an event", 409)
    }
    if (answer.status === 409) {
      learned.refused.push({
        id: event.id,
        why: "home holds a different event under this id",
      })
      continue
    }
    if (answer.status === 422) {
      learned.refused.push({ id: event.id, why: refusalOf(answer.body) })
      continue
    }
    const held = readAs(EventAnswer, answer.body)?.event.id ?? null
    if (answer.status !== 200 || held !== event.id) {
      return unexpectedAnswer("an event", answer.status)
    }
    learned.held.push(held)
  }
  return null
}

/** Step 2, for a phone with no log. Null when the exchange goes on. */
async function readRecord(
  keeping: JobsRecordPort,
  send: HomeCall
): Promise<HomeExchanged | null> {
  const answer = await send("GET", "/jobs")
  if (answer.status === 401) return { kind: "forgotten" }
  const record = readAs(HeldSchema, answer.body)
  if (answer.status !== 200 || record === null) {
    return unexpectedAnswer("the record", answer.status)
  }
  // The log can gain its first event while the read is out: then home's
  // copy is not taken in, and nothing failed.
  const empty = keeping.state().log.length === 0
  if (empty && record.events.length > 0 && !keeping.restored(record.events)) {
    return { kind: "failed", why: "this phone couldn't keep home's record" }
  }
  return null
}

/** Step 3. Null when the exchange goes on to its end. */
async function readDigests(
  keeping: JobsRecordPort,
  send: HomeCall
): Promise<HomeExchanged | null> {
  const after = newestDay(keeping.state())
  const path = after === null ? "/jobs/digests" : `/jobs/digests?after=${after}`
  const answer = await send("GET", path)
  if (answer.status === 401) return { kind: "forgotten" }
  const held = readAs(DigestsAnswer, answer.body)
  if (answer.status !== 200 || held === null) {
    return unexpectedAnswer("the digests", answer.status)
  }
  const valid: Array<Digest> = []
  for (const { day, digest } of held.digests) {
    const parsed = DigestSchema.safeParse(digest)
    if (parsed.success) {
      valid.push(parsed.data)
      continue
    }
    // Only the day, never the digest (nor the parse error, which quotes
    // it): it is the owner's picks.
    reportFailure({
      port: "home server (digests)",
      error: {
        ...toIntentError(null),
        summary: `The digest for ${day} couldn't be read.`,
      },
    })
  }
  keeping.fetched(valid.slice(-DIGESTS_PER_RUN))
  return null
}

async function exchange(
  keeping: JobsRecordPort,
  send: HomeCall,
  learned: Learned
): Promise<HomeExchanged> {
  const sent = await sendEvents(keeping, send, learned)
  if (sent !== null) return sent
  if (keeping.state().log.length === 0) {
    const read = await readRecord(keeping, send)
    if (read !== null) return read
  }
  return (await readDigests(keeping, send)) ?? { kind: "synced" }
}

/** Steps 1 to 3 through `send`. Throws what `send` throws. */
export async function exchangeJobs(
  keeping: JobsRecordPort,
  send: HomeCall
): Promise<HomeExchanged> {
  const learned: Learned = { held: [], refused: [] }
  try {
    return await exchange(keeping, send, learned)
  } finally {
    if (learned.held.length + learned.refused.length > 0) {
      keeping.answered(learned.held, learned.refused)
    }
  }
}
