/**
 * One exchange with home for the Jobs record kept on home: every event home
 * does not hold yet sent, then home's record read back. Over a `send` port
 * the app's home link hands in (`lib/home-link/jobs`), so this module makes
 * no request of its own. The routes are paulgsc/server's `routes/jobs.rs`.
 *
 * Home's copy is a copy: the phone keeps its whole log either way, since its
 * shares count events by their place in it. In order:
 *
 * 1. each event in `homeOutbox`, once (`PUT /jobs/events/:id`, the event as
 *    the body). Home answers with the event it holds; a `409` (another event
 *    under that id) or a `422` (an event it won't take, with why) is a
 *    refusal, kept on the phone and not sent again;
 * 2. home's whole record (`GET /jobs`), taken in only by a phone whose own
 *    log is empty: a reinstalled phone gets its record back.
 *
 * What an exchange learned is handed over as it ends, however it ends: a
 * throw part way (a stop, no answer) keeps what home already confirmed.
 */
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"
import { readAs, refusalOf, unexpectedAnswer } from "@some-ui/core-utils"
import { z } from "zod"

import type { HomeRefusal, JobEvent, JobsState } from "./model"
import { homeOutbox } from "./model"
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
}

const EventAnswer = z.object({ event: z.object({ id: z.string() }) })
const HeldSchema = z.object({ events: z.array(EventSchema) })
type Learned = { held: Array<string>; refused: Array<HomeRefusal> }

async function exchange(
  keeping: JobsRecordPort,
  send: HomeCall,
  learned: Learned
): Promise<HomeExchanged> {
  for (const event of homeOutbox(keeping.state())) {
    const answer = await send(
      "PUT",
      `/jobs/events/${encodeURIComponent(event.id)}`,
      JSON.stringify(event)
    )
    if (answer.status === 401) return { kind: "forgotten" }
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

  const answer = await send("GET", "/jobs")
  if (answer.status === 401) return { kind: "forgotten" }
  const record = readAs(HeldSchema, answer.body)
  if (answer.status !== 200 || record === null) {
    return unexpectedAnswer("the record", answer.status)
  }
  const empty = keeping.state().log.length === 0
  if (empty && record.events.length > 0 && !keeping.restored(record.events)) {
    return { kind: "failed", why: "this phone couldn't keep home's record" }
  }
  return { kind: "synced" }
}

/** Steps 1 and 2 through `send`. Throws what `send` throws. */
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
