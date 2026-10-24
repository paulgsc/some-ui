/**
 * "Send to home": everything this phone sends its paired home, in one tap
 * and one confirm that names what and where (LA8): the sessions (`./sessions`,
 * then freed from the phone once home holds them), the kept shelf items
 * home doesn't hold as they are now (`./shelf`, which stay), and the
 * LeetType sessions it doesn't hold as they are now (`./leetype-log`, which
 * stay too; `./sent` knows what it holds). One run, so one Stop ends all
 * three, and one line says how it went.
 */
import { counted, localStorageOrNull } from "@some-ui/core-utils"

import { deviceBackend } from "@/lib/device-backend/boot"
import { mayLeavePhone } from "@/lib/device-backend/handlers/sessions"
import type { Kept } from "@/lib/device-backend/handlers/shelf"
import { everyKept } from "@/lib/device-backend/handlers/shelf"
import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import { letGoUnchanged } from "@/lib/session-archive"
import { sessionsRepository } from "@/lib/tenant/queries"
import type { CopyResult, HeldReport } from "@/lib/tenant/sessions-copy"
import { emptyHeldReport } from "@/lib/tenant/sessions-copy"
import type { SessionRecord } from "@/lib/tenant/types"

import { hostOf } from "./address"
import { homeLink } from "./index"
import type { HomeSession, LogReport } from "./leetype-log"
import { emptyLogReport, logToSend, sendLog } from "./leetype-log"
import { remember, remembered } from "./remembered"
import { noticingBusy } from "./runtime"
import {
  readSent,
  rememberSent,
  sessionsHeld,
  shelfKeyOf,
  shelfToSend,
} from "./sent"
import { causedBy, copyAndConfirm, HomeForgotPhoneError } from "./sessions"
import type { SendReport } from "./shelf"
import { emptyReport, sendKept } from "./shelf"
import type { SyncResult } from "./sync"

const LAST_SEND_KEY = "some-ui.device.last-send.v1"

const sessions = (n: number): string => counted(n, "session")
const items = (n: number): string => counted(n, "kept item")
const leetype = (n: number): string => counted(n, "LeetType session")

/** This phone's sessions and kept items. Reads only this phone. */
export async function readPhone(): Promise<{
  local: Array<SessionRecord>
  kept: Array<Kept>
}> {
  const local = await sessionsRepository.list()
  const { context } = await deviceBackend()
  return { local, kept: await everyKept(context.db) }
}

/**
 * This phone's finished LeetType sessions, in their home form; null when
 * its session log can't be read. Reads only this phone.
 */
async function readLog(): Promise<Array<HomeSession> | null> {
  const { createSessionLogStore, finishedSessions, homeFormOf } = await import(
    "@some-ui/leetype"
  )
  const store = createSessionLogStore()
  if (store.readOnly) return null
  return finishedSessions(store.getSnapshot().log).map(
    ({ session, events }) => ({ session, events: events.map(homeFormOf) })
  )
}

/** Of `log`, what a send under `pairing` carries: what home doesn't hold as it is now. */
function logGoing(
  log: ReadonlyArray<HomeSession> | null,
  pairing: string
): Array<HomeSession> {
  return log === null
    ? []
    : logToSend(log, readSent(localStorageOrNull(), pairing))
}

/**
 * What a send would carry, for its confirm: its total, in words, how many
 * kept items it leaves out because home took them as they are now, and how
 * many LeetType sessions it copies.
 */
export type ToSend = {
  total: number
  what: string
  taken: number
  leetype: number
}

/**
 * The kept items a send under `pairing` carries: what home doesn't hold as
 * it is now. One home refused is offered again: a tap is the way to retry.
 */
function keptToSend(
  kept: ReadonlyArray<Kept>,
  pairing: string
): ReturnType<typeof shelfToSend> {
  return shelfToSend(kept, readSent(localStorageOrNull(), pairing), "again")
}

/**
 * What a send under `pairing` would carry, for its confirm. Reads only
 * this phone.
 */
export async function onPhone(pairing: string): Promise<ToSend> {
  const { local, kept } = await readPhone()
  const going = (await keptToSend(kept, pairing)).changed
  const log = logGoing(await readLog(), pairing)
  const parts = [
    ...(local.length > 0 ? [sessions(local.length)] : []),
    ...(going.length > 0 ? [items(going.length)] : []),
    ...(log.length > 0 ? [leetype(log.length)] : []),
  ]
  const what = new Intl.ListFormat("en", { type: "conjunction" }).format(parts)
  return {
    total: local.length + going.length + log.length,
    what,
    taken: kept.length - going.length,
    leetype: log.length,
  }
}

/** How one send went, for its line. */
export type SendOutcome = {
  readonly copy: CopyResult | null
  readonly held: HeldReport
  readonly freed: number
  readonly shelf: SendReport
  readonly log: LogReport
  /** What threw and ended the run early, if anything did. */
  readonly ended: unknown
  /** Home answered `429` at least once: it was busy. */
  readonly busy?: boolean
}

/** Why a send ended early, in the block's words. */
function endedLine(error: unknown, host: string, busy: boolean): string {
  if (causedBy(error, SyncStoppedError))
    return "Stopped: send again to carry on."
  if (causedBy(error, HomeForgotPhoneError)) {
    return `${host} no longer knows this phone: unpair, then pair again.`
  }
  if (busy) return "Home is busy right now: send again in a minute to carry on."
  return `Lost ${host}: send again to carry on.`
}

/** What ended the send early, or `null` when it ran to its end. */
function whyEnded({ copy, shelf, log, ended }: SendOutcome): unknown {
  if (copy?.outcome.kind === "partial") return copy.outcome.error
  if (ended !== null) return ended
  if (shelf.forgotten || log.forgotten) return new HomeForgotPhoneError()
  if (shelf.unreachable || log.unreachable) return new Error("no answer")
  return null
}

/** The send's end, short: what changed, then why it stopped, if it did. */
export function describeSend(outcome: SendOutcome, host: string): string {
  const { copy, held, freed, shelf, log } = outcome
  const why = whyEnded(outcome)
  const copied = copy?.outcome.copied ?? 0
  const sent = shelf.kept + shelf.replaced
  const logRefused = log.refused + log.other
  if (
    copied === 0 &&
    shelf.sent === 0 &&
    log.held === 0 &&
    why !== null &&
    !causedBy(why, SyncStoppedError) &&
    !causedBy(why, HomeForgotPhoneError)
  ) {
    return outcome.busy === true
      ? "Home is busy right now. Nothing was sent; try again in a minute."
      : `Couldn't reach ${host}. Are you on the home network? Nothing was sent.`
  }
  const full = [...shelf.full.values()].reduce((a, b) => a + b, 0)
  const parts = [
    copied > 0 ? `Copied ${sessions(copied)}.` : "",
    sent > 0 ? `Sent ${items(sent)}.` : "",
    log.held > 0 ? `Copied ${leetype(log.held)}.` : "",
    full > 0 ? `${full} didn't fit: home's shelf is full.` : "",
    shelf.refused + shelf.other > 0
      ? `${shelf.refused + shelf.other} refused by ${host}.`
      : "",
    logRefused > 0 ? `${leetype(logRefused)} refused by ${host}.` : "",
    freed > 0 ? `Cleared ${freed} from this phone.` : "",
    held.differs.length > 0
      ? `${held.differs.length} kept: home's copy didn't match.`
      : "",
    log.differs > 0
      ? `${leetype(log.differs)} kept here: home's copy didn't match.`
      : "",
    why === null ? "" : endedLine(why, host, outcome.busy === true),
  ].filter((part) => part !== "")
  return parts.length === 0 ? `${host} is up to date.` : parts.join(" ")
}

/**
 * What this send left home holding under `pairing`, for the next send to
 * skip (this one's, or the standing send's, `./standing`): every finished session, once the copy ran to its
 * end, each kept item home answered for, or refused, and each LeetType
 * session home read back as sent.
 */
function rememberHeld(
  pairing: string,
  copy: CopyResult | null,
  local: ReadonlyArray<SessionRecord>,
  heard: Record<"held" | "refused" | "leetype", Record<string, string>>
): void {
  const storage = localStorageOrNull()
  const finished = local.filter((s) => s.status === "completed")
  const sessions = copy?.outcome.kind === "copied" ? sessionsHeld(finished) : {}
  rememberSent(storage, readSent(storage, pairing), {
    sessions,
    shelf: heard.held,
    refused: heard.refused,
    leetype: heard.leetype,
  })
}

/** "time · what happened" for the last send, or "". */
export function lastSend(): string {
  return remembered(LAST_SEND_KEY)
}

/**
 * Sends this phone's sessions, kept items and finished LeetType sessions to
 * the paired home at `base`,
 * lets go of the finished sessions home confirms it holds, and calls
 * `refresh` once any left. Never throws: a failure is a line.
 */
export async function sendHome(
  { base, id }: { base: string; id: string },
  refresh: () => unknown = () => undefined,
  now = new Date()
): Promise<SyncResult> {
  const host = hostOf(base)
  let local: Array<SessionRecord>
  let kept: Array<Kept>
  let going: Array<HomeSession>
  try {
    ;({ local, kept } = await readPhone())
    going = logGoing(await readLog(), id)
  } catch (error) {
    return { ok: false, line: `Couldn't read this phone: ${String(error)}` }
  }
  const leaving = local.filter((s) => mayLeavePhone(s, now))
  const held = emptyHeldReport()
  const shelf = emptyReport()
  const log = emptyLogReport()
  const ran: { copy: CopyResult | null; ended: unknown } = {
    copy: null,
    ended: null,
  }
  let seen = { busy: false }
  const heard: Record<
    "held" | "refused" | "leetype",
    Record<string, string>
  > = { held: {}, refused: {}, leetype: {} }
  const run = await homeLink().send(async (link) => {
    const noticed = noticingBusy(link)
    seen = noticed.seen
    const { send } = noticed
    try {
      const step = await copyAndConfirm(send, local, leaving, held)
      ran.copy = step.copy
      ran.ended = step.ended
      if (step.ended !== null || step.copy.outcome.kind !== "copied") return
      const { changed, digests } = await keptToSend(kept, id)
      await sendKept(changed, send, shelf, (item, answer) => {
        const key = shelfKeyOf(item)
        heard[answer][key] = digests[key] ?? ""
      })
      if (shelf.forgotten || shelf.unreachable) return
      await sendLog(going, send, log, (session, digest) => {
        heard.leetype[session] = digest
      })
    } catch (error) {
      // Stopped, or home stopped answering: what was done stays done.
      ran.ended = error
    }
  })
  if (run === null) return { ok: false, line: "" }
  rememberHeld(id, ran.copy, local, heard)

  let freed = 0
  let freeing = ""
  try {
    freed = await letGoUnchanged(local.filter((s) => held.held.includes(s.id)))
    if (freed > 0) refresh()
  } catch (error) {
    freeing = ` Couldn't clear them from this phone: ${String(error)}`
  }
  const outcome: SendOutcome = {
    ...ran,
    held,
    freed,
    shelf,
    log,
    busy: seen.busy,
  }
  const line = describeSend(outcome, host) + freeing
  remember(LAST_SEND_KEY, `${new Date().toLocaleString()} · ${line}`)
  const clean =
    whyEnded(outcome) === null && held.differs.length === 0 && log.differs === 0
  return { ok: clean, line }
}
