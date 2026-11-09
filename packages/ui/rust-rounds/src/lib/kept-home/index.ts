/**
 * What Rust Rounds keeps on this phone goes home to be kept there for good
 * (RR14, paulgsc/some-ui#2689; paulgsc/server `/rust-weeks/:week/sent`,
 * `/rust-weeks/:week/pastes/:at`, `/rust-round-log/sessions/:id`):
 *
 * - **Each week sent** (`lib/week-play/store`'s `weeksSent`), as it is kept.
 *   Home makes the week's record from it, each ticket answered or not, and
 *   records a week that closed unsent itself: the phone sends nothing for
 *   silence. A take said but not sent by the deadline stays in the week's
 *   draft on this phone and is never sent (owner, 2026-11-07).
 * - **Each error pasted and kept** (`pasteStores`), one by one.
 * - **The card-era log** (`some-ui.rust-round-log/1`, `lib/play/log`), one
 *   session at a time, as it is kept. A session the cards add to after it
 *   went goes again, and home keeps it as a new revision when it only grew.
 *
 * **Home confirms before the phone counts it.** A week or a paste is home's
 * once home's answer carries it as sent; a session once it is read back as
 * sent. Only then is it marked here (`ON_HOME_KEY`), by a fingerprint of
 * what went, so a later change sends it again. **The phone lets go of
 * nothing**: its copies stay where they are kept, whatever home says
 * (CLAUDE.md, "Never lose the record").
 *
 * **A refusal is kept, not retried**: what home refused (`409`, `413`,
 * `422`) is marked by the same fingerprint and not sent again until it
 * changes, and it stays on this phone. A week home doesn't hold (`404`)
 * waits for the next run. A session whose id home's pattern can't take is
 * never sent and is counted as refused.
 *
 * Runs in the Rust Rounds lane (apps/www `lib/home-link/rust-rounds.ts`)
 * after the weeks' exchange, one request at a time; no screen waits on it.
 */
import { LOG_SCHEMA } from "@rust-rounds/lib/formats"
import type { Session } from "@rust-rounds/lib/formats"
import { ON_HOME_KEY } from "@rust-rounds/lib/play/keys"
import { keptLog } from "@rust-rounds/lib/play/store"
import type { WeekSent } from "@rust-rounds/lib/week-play/spec"
import type { KeptPaste } from "@rust-rounds/lib/week-play/store"
import { pasteStores, weeksSent } from "@rust-rounds/lib/week-play/store"
import type { HomeCall, HomeExchanged, KeyedStorage } from "@some-ui/core-utils"
import {
  canonicalJson,
  fnv1a,
  isRecord,
  jsonOf,
  openKept,
  readJson,
  unexpectedAnswer,
  writeKept,
} from "@some-ui/core-utils"
import { z } from "zod"

/** Home's pattern for a note's id and a log session's id. */
const HOME_ID = /^[A-Za-z0-9._:-]{1,64}$/

/** What the phone knows home did with each thing it sent, by fingerprint. */
export type OnHome = {
  /** Each week home holds as sent, by week id. */
  readonly sent: Readonly<Partial<Record<string, string>>>
  /** Each paste home holds, by when it was begun. */
  readonly pastes: Readonly<Partial<Record<string, string>>>
  /** Each log session home holds as read back, by id. */
  readonly sessions: Readonly<Partial<Record<string, string>>>
  /** What home refused, by `<kind>:<id>`; kept here, not sent again unless it changes. */
  readonly refused: Readonly<Partial<Record<string, string>>>
}

const NOTHING_ON_HOME: OnHome = {
  sent: {},
  pastes: {},
  sessions: {},
  refused: {},
}

const Marks = z.record(z.string(), z.string())
const OnHomeSchema = z.object({
  sent: Marks,
  pastes: Marks,
  sessions: Marks,
  refused: Marks,
})

const readOnHome = readJson((value) => {
  const parsed = OnHomeSchema.safeParse(value)
  return parsed.success ? parsed.data : null
})

/** What this phone knows home keeps, in `storage`. */
export const keptOnHome = (storage: KeyedStorage | null): OnHome =>
  openKept(storage, ON_HOME_KEY, readOnHome, NOTHING_ON_HOME).value

type Part = Exclude<keyof OnHome, "refused">

/** Of one kind, how many home holds as this phone keeps them, refused, or still waits on. */
export type KeptHomeCount = {
  readonly onHome: number
  readonly refused: number
  readonly waiting: number
}

/** Each kind's count: the weeks sent, the pastes, the log's sessions. */
export type KeptHomeCounts = Readonly<Record<Part, KeptHomeCount>>

/** The body of a week sent, as it goes: the week sent exactly as kept. */
const sentBody = (sent: WeekSent): string => canonicalJson(sent)

/** The body of a paste, as it goes: the week is the path's. */
const pasteBody = ({ at, text, note }: KeptPaste): string =>
  canonicalJson({ at, text, note })

/** The body of a log session, as it goes: the session with the log's schema. */
const sessionBody = (session: Session): string =>
  canonicalJson({ schema: LOG_SCHEMA, ...session })

/** A fingerprint of a body, as the home link's (`fnv1a`): its length and hash. */
const fingerprintOf = (body: string): string =>
  `${String(body.length)}:${String(fnv1a(body))}`

/** One thing to send: where, what, and how it is marked. */
type Item = {
  readonly part: Part
  readonly id: string
  readonly path: string
  readonly body: string
}

/** Everything the phone keeps that goes home, in the order it goes. */
function itemsOf(storage: KeyedStorage | null): Array<Item> {
  const weeks = (weeksSent(storage).list() ?? []).map(
    (sent): Item => ({
      part: "sent",
      id: sent.week,
      path: `/rust-weeks/${encodeURIComponent(sent.week)}/sent`,
      body: sentBody(sent),
    })
  )
  const pastes = pasteStores(storage)
    .pastes.list()
    .map(
      (paste): Item => ({
        part: "pastes",
        id: paste.at,
        path: `/rust-weeks/${encodeURIComponent(paste.week)}/pastes/${encodeURIComponent(paste.at)}`,
        body: pasteBody(paste),
      })
    )
  const sessions = keptLog(storage).sessions.map(
    (session): Item => ({
      part: "sessions",
      id: session.id,
      path: `/rust-round-log/sessions/${encodeURIComponent(session.id)}`,
      body: sessionBody(session),
    })
  )
  return [...weeks, ...pastes, ...sessions]
}

const refusedKey = ({ part, id }: Pick<Item, "part" | "id">): string =>
  `${part}:${id}`

/** Whether `item`, as it is now, needs no send: home holds it, or refused it. */
function settled(on: OnHome, item: Item): boolean {
  const print = fingerprintOf(item.body)
  return (
    on[item.part][item.id] === print || on.refused[refusedKey(item)] === print
  )
}

/** How many of what this phone keeps home holds as it is, refused, or still waits on. */
export function keptHomeCounts(storage: KeyedStorage | null): KeptHomeCounts {
  const on = keptOnHome(storage)
  const counts: Record<
    Part,
    { onHome: number; refused: number; waiting: number }
  > = {
    sent: { onHome: 0, refused: 0, waiting: 0 },
    pastes: { onHome: 0, refused: 0, waiting: 0 },
    sessions: { onHome: 0, refused: 0, waiting: 0 },
  }
  for (const item of itemsOf(storage)) {
    const print = fingerprintOf(item.body)
    const count = counts[item.part]
    if (on[item.part][item.id] === print) count.onHome += 1
    else if (on.refused[refusedKey(item)] === print) count.refused += 1
    else count.waiting += 1
  }
  return counts
}

/** Whether home's answer to a PUT carries `body` under `key`. */
function carries(answer: string, key: string, body: string): boolean {
  const parsed = jsonOf(answer)
  return isRecord(parsed) && canonicalJson(parsed[key]) === body
}

/** Whether a session read back is the one sent. */
const readsBack = (answer: string, body: string): boolean =>
  canonicalJson(jsonOf(answer)) === body

const FORGOTTEN: HomeExchanged = { kind: "forgotten" }

/** The phone could not keep what home said: its own fault, said as such. */
const NOT_KEPT: HomeExchanged = { kind: "failed", why: "fault" }

/**
 * One run through `send`: each thing the phone keeps that home doesn't hold
 * as it is now goes, one request at a time (the module's rules). Throws
 * what `send` throws.
 */
export async function exchangeKeptHome(
  storage: KeyedStorage | null,
  send: HomeCall
): Promise<HomeExchanged> {
  const mark = (item: Item, as: "held" | "refused"): boolean => {
    const on = keptOnHome(storage)
    const print = fingerprintOf(item.body)
    const next: OnHome =
      as === "held"
        ? { ...on, [item.part]: { ...on[item.part], [item.id]: print } }
        : { ...on, refused: { ...on.refused, [refusedKey(item)]: print } }
    return writeKept(storage, ON_HOME_KEY, next, readOnHome)
  }

  let failed: number | null = null
  for (const item of itemsOf(storage)) {
    if (settled(keptOnHome(storage), item)) continue
    if (!HOME_ID.test(item.id) && item.part === "sessions") {
      if (!mark(item, "refused")) return NOT_KEPT
      continue
    }
    const put = await send("PUT", item.path, item.body)
    if (put.status === 401) return FORGOTTEN
    if (put.status === 404) continue
    if (put.status === 409 || put.status === 413 || put.status === 422) {
      if (!mark(item, "refused")) return NOT_KEPT
      continue
    }
    if (put.status !== 200 && put.status !== 201) {
      failed ??= put.status
      continue
    }
    let held: boolean
    if (item.part === "sessions") {
      const back = await send("GET", item.path)
      if (back.status === 401) return FORGOTTEN
      held = back.status === 200 && readsBack(back.body, item.body)
    } else {
      held = carries(
        put.body,
        item.part === "sent" ? "sent" : "paste",
        item.body
      )
    }
    if (held && !mark(item, "held")) return NOT_KEPT
  }
  return failed === null
    ? { kind: "synced" }
    : unexpectedAnswer("what Rust Rounds keeps", failed)
}
