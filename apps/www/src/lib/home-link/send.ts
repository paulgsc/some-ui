/**
 * "Send to home": everything this phone sends its paired home, in one tap
 * and one confirm that names what and where (LA8): the sessions (`./sessions`,
 * then freed from the phone once home holds them), the kept shelf items
 * home doesn't hold as they are now (`./shelf`, which stay), the
 * LeetType sessions it doesn't hold as they are now (`./leetype-log`, which
 * stay too; `./sent` knows what it holds), and Studio's sittings and how
 * each went (`./studio-log`, which stay too). One run, so one Stop ends
 * them all, and one line says how it went.
 */
import type { HomeCall, KeyedStorage } from "@some-ui/core-utils"
import { counted, localStorageOrNull } from "@some-ui/core-utils"
import type { HomeSession } from "@some-ui/leetype"

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
import type { HomeLink } from "./index"
import { homeLink } from "./index"
import type { LogReport } from "./leetype-log"
import { emptyLogReport, sendLog } from "./leetype-log"
import { remember, remembered } from "./remembered"
import { noticingBusy } from "./runtime"
import {
  logToSend,
  readSent,
  rememberSent,
  sessionsHeld,
  shelfKeyOf,
  shelfToSend,
} from "./sent"
import { causedBy, copyAndConfirm, HomeForgotPhoneError } from "./sessions"
import type { SendReport } from "./shelf"
import { emptyReport, sendKept } from "./shelf"
import { studioKeeping } from "./studio"
import type { StudioGoing } from "./studio-log"
import {
  reportsOf,
  sendStudio,
  sittingsGoing,
  studioToSend,
} from "./studio-log"
import type { SyncResult } from "./sync"

const LAST_SEND_KEY = "some-ui.device.last-send.v1"

const sessions = (n: number): string => counted(n, "session")
const items = (n: number): string => counted(n, "kept item")
const leetype = (n: number): string => counted(n, "LeetType session")
const studio = (n: number): string => counted(n, "Studio sitting")
const entries = (n: number): string =>
  counted(n, "Studio entry", "Studio entries")

/** What `sendHome` and `onPhone` read and call; the defaults are the phone's own. A seam for tests. */
export type SendPorts = {
  /** This phone's sessions and kept items (`readPhone`). */
  read: () => Promise<{ local: Array<SessionRecord>; kept: Array<Kept> }>
  /** The finished LeetType sessions a send under `pairing` carries (`logGoing`). */
  logGoing: (pairing: string) => Promise<Array<HomeSession>>
  /** What of Studio's record a send under `pairing` carries (`studioGoing`). */
  studioGoing: (pairing: string) => Promise<StudioGoing>
  /** Where `./sent` remembers what home holds. */
  storage: KeyedStorage | null
  /** Runs one send on the paired link: `homeLink().send`. */
  run: HomeLink["send"]
  /** The sessions copy and its confirm (`./sessions`'s `copyAndConfirm`). */
  copy: typeof copyAndConfirm
}

/**
 * The phone's own ports, also available to callers supplying selected overrides.
 * @public
 */
export function sendPorts(): SendPorts {
  const storage = localStorageOrNull()
  return {
    read: readPhone,
    logGoing: (pairing) => logGoing(pairing, storage),
    studioGoing: (pairing) => studioGoing(pairing, storage),
    storage,
    run: <T>(r: (send: HomeCall) => Promise<T>) => homeLink().send(r),
    copy: copyAndConfirm,
  }
}

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
 * What a send under `pairing` carries of this phone's finished LeetType
 * sessions, in their home form: what home doesn't hold as it is now; none
 * when the session log can't be read. Reads only this phone.
 */
async function logGoing(
  pairing: string,
  storage: KeyedStorage | null
): Promise<Array<HomeSession>> {
  const { createSessionLogStore, finishedSessions } = await import(
    "@some-ui/leetype"
  )
  const store = createSessionLogStore()
  if (store.readOnly) return []
  return logToSend(
    finishedSessions(store.getSnapshot().log),
    readSent(storage, pairing)
  )
}

/**
 * What a send under `pairing` carries of Studio's time log and answers:
 * what home doesn't hold as it is now. Reads only this phone.
 */
async function studioGoing(
  pairing: string,
  storage: KeyedStorage | null
): Promise<StudioGoing> {
  // Until Studio's route hands its record in (`./studio`), there is none.
  const studio = studioKeeping()
  if (studio === null) return { sittings: [], reports: [] }
  const [list, friction] = await Promise.all([
    studio.store.list(),
    studio.store.friction(),
  ])
  return studioToSend(
    studio.timeLog(),
    reportsOf(friction, list, studio.sittingKey),
    readSent(storage, pairing)
  )
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
  studio: number
}

/**
 * The kept items a send under `pairing` carries: what home doesn't hold as
 * it is now. One home refused is offered again: a tap is the way to retry.
 */
function keptToSend(
  kept: ReadonlyArray<Kept>,
  pairing: string,
  storage: KeyedStorage | null
): ReturnType<typeof shelfToSend> {
  return shelfToSend(kept, readSent(storage, pairing), "again")
}

/**
 * What a send under `pairing` would carry, for its confirm. Reads only
 * this phone.
 */
export async function onPhone(
  pairing: string,
  ports: SendPorts = sendPorts()
): Promise<ToSend> {
  const { local, kept } = await ports.read()
  const going = (await keptToSend(kept, pairing, ports.storage)).changed
  const log = await ports.logGoing(pairing)
  const sittings = sittingsGoing(await ports.studioGoing(pairing))
  const parts = [
    ...(local.length > 0 ? [sessions(local.length)] : []),
    ...(going.length > 0 ? [items(going.length)] : []),
    ...(log.length > 0 ? [leetype(log.length)] : []),
    ...(sittings > 0 ? [studio(sittings)] : []),
  ]
  const what = new Intl.ListFormat("en", { type: "conjunction" }).format(parts)
  return {
    total: local.length + going.length + log.length + sittings,
    what,
    taken: kept.length - going.length,
    leetype: log.length,
    studio: sittings,
  }
}

/** How one send went, for its line. */
export type SendOutcome = {
  readonly copy: CopyResult | null
  readonly held: HeldReport
  readonly freed: number
  readonly shelf: SendReport
  readonly log: LogReport
  /** Studio's sittings and answers, counted as LeetType's sessions are. */
  readonly studio: LogReport
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
function whyEnded({
  copy,
  shelf,
  log,
  studio: sat,
  ended,
}: SendOutcome): unknown {
  if (copy?.outcome.kind === "partial") return copy.outcome.error
  if (ended !== null) return ended
  if (shelf.forgotten || log.forgotten || sat.forgotten)
    return new HomeForgotPhoneError()
  if (shelf.unreachable || log.unreachable || sat.unreachable)
    return new Error("no answer")
  return null
}

/** The send's end, short: what changed, then why it stopped, if it did. */
export function describeSend(outcome: SendOutcome, host: string): string {
  const { copy, held, freed, shelf, log, studio: sat } = outcome
  const why = whyEnded(outcome)
  const copied = copy?.outcome.copied ?? 0
  const sent = shelf.kept + shelf.replaced
  const logRefused = log.refused + log.other
  if (
    copied === 0 &&
    shelf.sent === 0 &&
    log.held === 0 &&
    sat.held === 0 &&
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
    sat.held > 0 ? `Copied ${entries(sat.held)}.` : "",
    full > 0 ? `${full} didn't fit: home's shelf is full.` : "",
    shelf.refused + shelf.other > 0
      ? `${shelf.refused + shelf.other} refused by ${host}.`
      : "",
    logRefused > 0 ? `${leetype(logRefused)} refused by ${host}.` : "",
    sat.refused + sat.other > 0
      ? `${entries(sat.refused + sat.other)} refused by ${host}.`
      : "",
    freed > 0 ? `Cleared ${freed} from this phone.` : "",
    held.differs.length > 0
      ? `${held.differs.length} kept: home's copy didn't match.`
      : "",
    log.differs > 0
      ? `${leetype(log.differs)} kept here: home's copy didn't match.`
      : "",
    sat.differs > 0
      ? `${studio(sat.differs)} kept here: home's copy didn't match.`
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
  heard: Record<
    "held" | "refused" | "leetype" | "studio",
    Record<string, string>
  >,
  storage: KeyedStorage | null
): void {
  const finished = local.filter((s) => s.status === "completed")
  const sessions = copy?.outcome.kind === "copied" ? sessionsHeld(finished) : {}
  rememberSent(storage, readSent(storage, pairing), {
    sessions,
    shelf: heard.held,
    refused: heard.refused,
    leetype: heard.leetype,
    studio: heard.studio,
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
  now = new Date(),
  ports: SendPorts = sendPorts()
): Promise<SyncResult> {
  const host = hostOf(base)
  let local: Array<SessionRecord>
  let kept: Array<Kept>
  let going: Array<HomeSession>
  let studioing: StudioGoing
  try {
    ;({ local, kept } = await ports.read())
    going = await ports.logGoing(id)
    studioing = await ports.studioGoing(id)
  } catch (error) {
    return { ok: false, line: `Couldn't read this phone: ${String(error)}` }
  }
  const leaving = local.filter((s) => mayLeavePhone(s, now))
  const held = emptyHeldReport()
  const shelf = emptyReport()
  const log = emptyLogReport()
  const sat = emptyLogReport()
  const ran: { copy: CopyResult | null; ended: unknown } = {
    copy: null,
    ended: null,
  }
  let seen = { busy: false }
  const heard: Record<
    "held" | "refused" | "leetype" | "studio",
    Record<string, string>
  > = { held: {}, refused: {}, leetype: {}, studio: {} }
  const run = await ports.run(async (link) => {
    const noticed = noticingBusy(link)
    seen = noticed.seen
    const { send } = noticed
    try {
      const { copy } = ports
      const step = await copy(send, local, leaving, held)
      ran.copy = step.copy
      ran.ended = step.ended
      if (step.ended !== null || step.copy.outcome.kind !== "copied") return
      const { changed, digests } = await keptToSend(kept, id, ports.storage)
      await sendKept(changed, send, shelf, (item, answer) => {
        const key = shelfKeyOf(item)
        heard[answer][key] = digests[key] ?? ""
      })
      if (shelf.forgotten || shelf.unreachable) return
      await sendLog(going, send, log, (session, digest) => {
        heard.leetype[session] = digest
      })
      if (log.forgotten || log.unreachable) return
      await sendStudio(studioing, send, sat, (key, digest) => {
        heard.studio[key] = digest
      })
    } catch (error) {
      // Stopped, or home stopped answering: what was done stays done.
      ran.ended = error
    }
  })
  if (run === null) return { ok: false, line: "" }
  rememberHeld(id, ran.copy, local, heard, ports.storage)

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
    studio: sat,
    busy: seen.busy,
  }
  const line = describeSend(outcome, host) + freeing
  remember(LAST_SEND_KEY, `${new Date().toLocaleString()} · ${line}`)
  const clean =
    whyEnded(outcome) === null &&
    held.differs.length === 0 &&
    log.differs === 0 &&
    sat.differs === 0
  return { ok: clean, line }
}
