/**
 * "Send to home": everything this phone sends its paired home, in one tap
 * and one confirm that names what and where (LA8): the sessions (`./sessions`,
 * then freed from the phone once home holds them) and the kept shelf items
 * home doesn't hold as they are now (`./shelf`, which stay; `./sent` knows
 * what it holds). One run, so one Stop ends both, and one line says how it
 * went.
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
 * What a send would carry, for its confirm: its total, in words, and how
 * many kept items it leaves out because home took them as they are now.
 */
export type ToSend = { total: number; what: string; taken: number }

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
  const what = [
    ...(local.length > 0 ? [sessions(local.length)] : []),
    ...(going.length > 0 ? [items(going.length)] : []),
  ].join(" and ")
  return {
    total: local.length + going.length,
    what,
    taken: kept.length - going.length,
  }
}

/** How one send went, for its line. */
export type SendOutcome = {
  readonly copy: CopyResult | null
  readonly held: HeldReport
  readonly freed: number
  readonly shelf: SendReport
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
function whyEnded({ copy, shelf, ended }: SendOutcome): unknown {
  if (copy?.outcome.kind === "partial") return copy.outcome.error
  if (ended !== null) return ended
  if (shelf.forgotten) return new HomeForgotPhoneError()
  if (shelf.unreachable) return new Error("no answer")
  return null
}

/** The send's end, short: what changed, then why it stopped, if it did. */
export function describeSend(outcome: SendOutcome, host: string): string {
  const { copy, held, freed, shelf } = outcome
  const why = whyEnded(outcome)
  const copied = copy?.outcome.copied ?? 0
  const sent = shelf.kept + shelf.replaced
  if (
    copied === 0 &&
    shelf.sent === 0 &&
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
    full > 0 ? `${full} didn't fit: home's shelf is full.` : "",
    shelf.refused + shelf.other > 0
      ? `${shelf.refused + shelf.other} refused by ${host}.`
      : "",
    freed > 0 ? `Cleared ${freed} from this phone.` : "",
    held.differs.length > 0
      ? `${held.differs.length} kept: home's copy didn't match.`
      : "",
    why === null ? "" : endedLine(why, host, outcome.busy === true),
  ].filter((part) => part !== "")
  return parts.length === 0 ? `${host} is up to date.` : parts.join(" ")
}

/**
 * What this send left home holding under `pairing`, for the next send to
 * skip (this one's, or the standing send's, `./standing`): every finished session, once the copy ran to its
 * end, and each kept item home answered for, or refused.
 */
function rememberHeld(
  pairing: string,
  copy: CopyResult | null,
  local: ReadonlyArray<SessionRecord>,
  heard: Record<"held" | "refused", Record<string, string>>
): void {
  const storage = localStorageOrNull()
  const finished = local.filter((s) => s.status === "completed")
  const sessions = copy?.outcome.kind === "copied" ? sessionsHeld(finished) : {}
  rememberSent(storage, readSent(storage, pairing), {
    sessions,
    shelf: heard.held,
    refused: heard.refused,
  })
}

/** "time · what happened" for the last send, or "". */
export function lastSend(): string {
  return remembered(LAST_SEND_KEY)
}

/**
 * Sends this phone's sessions and kept items to the paired home at `base`,
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
  try {
    ;({ local, kept } = await readPhone())
  } catch (error) {
    return { ok: false, line: `Couldn't read this phone: ${String(error)}` }
  }
  const leaving = local.filter((s) => mayLeavePhone(s, now))
  const held = emptyHeldReport()
  const shelf = emptyReport()
  const ran: { copy: CopyResult | null; ended: unknown } = {
    copy: null,
    ended: null,
  }
  let seen = { busy: false }
  const heard: Record<"held" | "refused", Record<string, string>> = {
    held: {},
    refused: {},
  }
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
  const outcome: SendOutcome = { ...ran, held, freed, shelf, busy: seen.busy }
  const line = describeSend(outcome, host) + freeing
  remember(LAST_SEND_KEY, `${new Date().toLocaleString()} · ${line}`)
  const clean = whyEnded(outcome) === null && held.differs.length === 0
  return { ok: clean, line }
}
