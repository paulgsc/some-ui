/**
 * One exchange with home for the Jobs record on a paired phone: every event home
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
 *    refusal, kept on the phone and not sent again; a `409` from a home
 *    that still carries a stop from before HF8 (`stoppedOnHome`, until
 *    paulgsc/server drops it) refuses nothing and ends the exchange;
 * 2. home's whole record (`GET /jobs`), asked for only by a phone whose own
 *    log is empty, the one that takes it in: a reinstalled phone gets its
 *    record back;
 * 2½. the decisions and scouts files a share would send, when they name no
 *    voice note (`PUT /jobs/files/:name`, the file as the body): home hands
 *    them to the mailbox for the morning run. A `200` records the file shared
 *    and arrived, as a share the person confirmed would; a `409` or `422` is
 *    a refusal, kept by name and the file never filed again (it stays on the
 *    share sheet). A file naming a voice note waits for the share sheet,
 *    which carries the audio to Drive, since the mailbox carries no audio
 *    (home's own copy of a note goes by the voice lane, LA13);
 * 2¾. whether home should tell this phone when a morning run is in
 *    (`PUT` or `DELETE /jobs/notice`, `./notice`'s `noticeFiling`): at most
 *    one token taken back and one filed. A `200` records what home holds; a
 *    `422` is a token home won't take, dropped so it is not sent again; a
 *    home from before the notice (a `404`) is asked again next time;
 * 3. home's records of the morning runs (`GET /jobs/runs`), its newest
 *    few: what each run did, and what it couldn't, a stopped run included.
 *    A record the phone can't read is skipped, and a home that doesn't keep
 *    them (a `404`) tells none;
 * 4. home's digests (`GET /jobs/digests`), the days after the newest one the
 *    phone holds (the newest few, on a phone holding none): the morning
 *    run's picks, which home takes from the mailbox. At most
 *    `DIGESTS_PER_RUN` are taken in (`fetched` decides which are kept), with
 *    step 3's records, so a look at home says both or neither. A digest the
 *    phone can't read is skipped and the rest are taken.
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
import type { Digest, JobsRun } from "@some-ui/job-desk"
import { DigestSchema, JobsRunSchema } from "@some-ui/job-desk"
import { z } from "zod"

import type { Outgoing, OutgoingFile } from "./files"
import { isFile } from "./files"
import type { HomeRefusal, JobEvent, JobsState, ShareKind } from "./model"
import { DIGESTS_PER_RUN, homeOutbox, newestDay } from "./model"
import { noticeFiling } from "./notice"
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
  /**
   * Digests home holds, for the record to take in, and its runs' records
   * (none from a home that doesn't keep them).
   */
  fetched: (
    digests: ReadonlyArray<Digest>,
    runs?: ReadonlyArray<JobsRun>
  ) => void
  /** The file a share of `kind` would send now, as the runtime builds it. */
  outgoing: (kind: ShareKind) => Outgoing
  /** Home holds `file`: recorded shared and arrived. False if not kept. */
  filed: (kind: ShareKind, file: OutgoingFile) => boolean
  /** Home refused the file of this name. */
  fileRefused: (name: string) => void
  /** Home holds `token` for this phone's notice, or none. */
  noticeFiled: (token: string | null) => void
  /** Home won't take this phone's token: it is dropped. */
  noticeRefused: () => void
}

const EventAnswer = z.object({ event: z.object({ id: z.string() }) })
const HeldSchema = z.object({ events: z.array(EventSchema) })
/** Each digest is read by job-desk's own parser, not by this schema. */
const DigestsAnswer = z.object({
  digests: z.array(z.object({ day: z.iso.date(), digest: z.unknown() })),
})
/** Each record is read by job-desk's own schema, not by this one. */
const RunsAnswer = z.object({
  runs: z.array(z.object({ name: z.string(), run: z.unknown() })),
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
    // A stop home kept from before HF8 (#2182): not a refusal of the event.
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

/** At most a token taken back and one filed. */
const NOTICE_FILINGS_PER_EXCHANGE = 2

const NoticeAnswer = z.object({
  change: z.enum(["added", "unchanged", "removed"]),
})

/** Step 2¾. Null when the exchange goes on to its end. */
async function fileNotice(
  keeping: JobsRecordPort,
  send: HomeCall
): Promise<HomeExchanged | null> {
  for (let i = 0; i < NOTICE_FILINGS_PER_EXCHANGE; i += 1) {
    const filing = noticeFiling(keeping.state().home.notice)
    if (filing === null) return null
    const answer = await send(
      filing.method,
      "/jobs/notice",
      JSON.stringify({ token: filing.token })
    )
    if (answer.status === 401) return { kind: "forgotten" }
    // A home from before the notice: nothing filed, and asked again later.
    if (answer.status === 404) return null
    if (stoppedOnHome(answer)) return unexpectedAnswer("the notice", 409)
    if (answer.status === 422) {
      // Never the token: it names this phone to its push service.
      reportFailure({
        port: "home server (notice)",
        error: {
          ...toIntentError(null),
          summary: "Home didn’t take this phone’s notice token.",
        },
      })
      if (filing.method === "PUT") keeping.noticeRefused()
      else keeping.noticeFiled(null)
      continue
    }
    if (answer.status !== 200 || readAs(NoticeAnswer, answer.body) === null) {
      return unexpectedAnswer("the notice", answer.status)
    }
    keeping.noticeFiled(filing.method === "PUT" ? filing.token : null)
  }
  return null
}

/** Step 3: the records, or none from a home that doesn't keep them. */
async function readRuns(
  send: HomeCall
): Promise<{ runs: ReadonlyArray<JobsRun> | undefined } | HomeExchanged> {
  const answer = await send("GET", "/jobs/runs")
  if (answer.status === 401) return { kind: "forgotten" }
  // A home from before the runs were kept: the digests still come.
  if (answer.status === 404) return { runs: undefined }
  const held = readAs(RunsAnswer, answer.body)
  if (answer.status !== 200 || held === null) {
    return unexpectedAnswer("the runs", answer.status)
  }
  const runs: Array<JobsRun> = []
  for (const { name, run } of held.runs) {
    const parsed = JobsRunSchema.safeParse(run)
    if (parsed.success) {
      runs.push(parsed.data)
      continue
    }
    reportFailure({
      port: "home server (runs)",
      error: {
        ...toIntentError(null),
        summary: `The record ${name} couldn't be read.`,
      },
    })
  }
  return { runs }
}

/** Steps 3 and 4. Null when the exchange goes on to its end. */
async function readDigests(
  keeping: JobsRecordPort,
  send: HomeCall
): Promise<HomeExchanged | null> {
  const read = await readRuns(send)
  if ("kind" in read) return read
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
  keeping.fetched(valid.slice(-DIGESTS_PER_RUN), read.runs)
  return null
}

const FILED: ReadonlyArray<ShareKind> = ["decisions", "scouts"]

/** Step 2½. Null when the exchange goes on to its end. */
async function fileOutgoing(
  keeping: JobsRecordPort,
  send: HomeCall
): Promise<HomeExchanged | null> {
  for (const kind of FILED) {
    const file = keeping.outgoing(kind)
    if (!isFile(file) || file.voice.length > 0) continue
    if (keeping.state().home.refusedFiles.includes(file.name)) continue
    const answer = await send(
      "PUT",
      `/jobs/files/${encodeURIComponent(file.name)}`,
      file.json
    )
    if (answer.status === 401) return { kind: "forgotten" }
    if (stoppedOnHome(answer)) return unexpectedAnswer("a file", 409)
    if (answer.status === 409 || answer.status === 422) {
      keeping.fileRefused(file.name)
      // The name only, never the file: it is the owner's decisions.
      reportFailure({
        port: "home server (files)",
        error: {
          ...toIntentError(null),
          summary: `Home didn’t take ${file.name}; it stays on the share sheet.`,
        },
      })
      continue
    }
    if (answer.status !== 200) return unexpectedAnswer("a file", answer.status)
    keeping.filed(kind, file)
  }
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
  const filed = await fileOutgoing(keeping, send)
  if (filed !== null) return filed
  const told = await fileNotice(keeping, send)
  if (told !== null) return told
  return (await readDigests(keeping, send)) ?? { kind: "synced" }
}

/** Steps 1 to 4 through `send`. Throws what `send` throws. */
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
