/**
 * "Copy sessions to home": the phone's own sessions copied into the paired
 * home account, after a tap and a confirm that names the count and the host
 * (LA8). Only the session records go, each one's plan, status and times
 * (canon Rem. 7.6 (a)); reflections, stops and soundbites stay on the phone
 * (LA7). Nothing on home is deleted, and a copy cannot be taken back from
 * here.
 *
 * The point of copying is that the phone can let go. Once the copy has run,
 * home is asked for each finished session (`mayLeavePhone`) and the ones it
 * holds exactly as the phone does (`confirmHeld`, read back) leave the
 * phone; unfinished sessions and today's stay, and so does any session home
 * does not hold as it is here. The plan and receipt are
 * `lib/tenant/sessions-copy`'s.
 */
import { mayLeavePhone } from "@/lib/device-backend/handlers/sessions"
import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import { deviceStorage } from "@/lib/device-backend/storage-view"
import type { FileHostTransport } from "@/lib/file-host-config/client"
import { createHttpSessionsRepository } from "@/lib/tenant/http-sessions-repository"
import { sessionsRepository } from "@/lib/tenant/queries"
import type { CopyResult, HeldReport } from "@/lib/tenant/sessions-copy"
import {
  confirmHeld,
  copySessionsTo,
  emptyHeldReport,
} from "@/lib/tenant/sessions-copy"
import type { SessionRecord } from "@/lib/tenant/types"

import { hostOf } from "./address"
import { homeLink } from "./index"
import { remember, remembered } from "./remembered"
import type { HomeSend } from "./runtime"
import type { ToSend } from "./shelf"
import type { SyncResult } from "./sync"

const LAST_COPY_KEY = "some-ui.device.last-sessions-copy.v1"

/** Home answered `401`: it no longer knows this phone. */
class HomeForgotPhoneError extends Error {
  constructor() {
    super("the home server no longer knows this phone")
    this.name = "HomeForgotPhoneError"
  }
}

/**
 * The link's `send` as the transport the sessions repository speaks. A `401`
 * is thrown before `requestJSON` sees it: it is the pairing's, not this
 * app's sign-in, so the app's own sign-out must not run.
 */
export function homeTransport(send: HomeSend): FileHostTransport {
  return async (route, init) => {
    const method = (init?.method ?? "GET").toUpperCase()
    if (method !== "GET" && method !== "POST" && method !== "PATCH") {
      throw new Error(`a sessions copy does not ${method}`)
    }
    const body = typeof init?.body === "string" ? init.body : undefined
    const answer = await send(method, route, body)
    if (answer.status === 401) throw new HomeForgotPhoneError()
    return new Response(answer.status === 204 ? null : answer.body, {
      status: answer.status,
    })
  }
}

/** `error` is a `kind`, or `requestJSON`'s wrapping of one. */
function causedBy(
  error: unknown,
  kind: new (...args: Array<never>) => Error
): boolean {
  if (error instanceof kind) return true
  return error instanceof Error && error.cause instanceof kind
}

const STOPPED_EARLY = "Stopped before anything was copied."

const sessions = (n: number): string => `${n} session${n === 1 ? "" : "s"}`

/** What a copy would consider, for its confirm. Reads only this phone. */
export async function sessionsOnPhone(): Promise<ToSend> {
  const total = (await sessionsRepository.list()).length
  return { total, what: sessions(total) }
}

/** The copy's end in the block's words. */
export function describeCopy(result: CopyResult, host: string): string {
  const { outcome } = result
  if (outcome.kind === "copied") {
    return outcome.copied === 0
      ? `${host} is up to date.`
      : `Copied ${sessions(outcome.copied)} to ${host}.`
  }
  const { copied, remaining, error } = outcome
  const sent = `Copied ${sessions(copied)} to ${host}; ${remaining} not yet.`
  if (causedBy(error, SyncStoppedError)) {
    return `Stopped. ${sent} Copy again to carry on.`
  }
  if (causedBy(error, HomeForgotPhoneError)) {
    return `${sent} ${host} no longer knows this phone: unpair, then pair again.`
  }
  return `${sent} Lost ${host} there; copy again to carry on.`
}

/** "time · what happened" for the last copy, or "". */
export function lastCopy(): string {
  return remembered(LAST_COPY_KEY)
}

/** What letting go of home's confirmed copies did, in the block's words. */
export function describeFreed(report: HeldReport, freed: number): string {
  const parts: Array<string> = []
  if (freed > 0) parts.push(`Cleared ${freed} from this phone.`)
  if (report.differs.length > 0) {
    parts.push(`${report.differs.length} kept: edited since copied.`)
  }
  return parts.join(" ")
}

/**
 * Lets go of the phone's copies of `held`, each only if it is unchanged
 * since `read` (what home was compared against). Returns how many left.
 */
async function letGoHeld(
  held: ReadonlyArray<string>,
  read: ReadonlyArray<SessionRecord>
): Promise<number> {
  if (held.length === 0) return 0
  const asRead = new Map(read.map((s) => [s.id, s.updatedAt]))
  const now = await sessionsRepository.list()
  const unchanged = now
    .filter((s) => held.includes(s.id) && asRead.get(s.id) === s.updatedAt)
    .map((s) => s.id)
  if (unchanged.length > 0) await sessionsRepository.removeMany(unchanged)
  return unchanged.length
}

/**
 * Copies this phone's sessions to the paired `base`, then lets go of the
 * finished ones home confirms it holds, and calls `refresh` once any left.
 * Never throws: a failure is a line.
 */
export async function copySessionsHome(
  base: string,
  refresh: () => unknown = () => undefined,
  now = new Date()
): Promise<SyncResult> {
  const host = hostOf(base)
  let local: Array<SessionRecord>
  try {
    local = await sessionsRepository.list()
  } catch (error) {
    return {
      ok: false,
      line: `Couldn't read this phone's sessions: ${String(error)}`,
    }
  }
  const leaving = local.filter((s) => mayLeavePhone(s, now))
  const report = emptyHeldReport()
  try {
    const outcome = await homeLink().send(async (send) => {
      const remote = createHttpSessionsRepository(homeTransport(send))
      const copied = await copySessionsTo(local, remote)
      try {
        await confirmHeld(leaving, remote, report)
      } catch {
        // Stopped, or home stopped answering: what was confirmed before
        // that still leaves; the rest stays for the next copy.
      }
      return copied
    })
    if (outcome === null) return { ok: false, line: "" }
    let freedLine = ""
    try {
      const freed = await letGoHeld(report.held, local)
      freedLine = describeFreed(report, freed)
      if (freed > 0) {
        refresh()
        void deviceStorage.refresh()
      }
    } catch (error) {
      freedLine = `Couldn't clear them from this phone: ${String(error)}`
    }
    const copyLine =
      outcome.kind === "stopped"
        ? STOPPED_EARLY
        : describeCopy(outcome.value, host)
    const line = [copyLine, freedLine].filter((part) => part !== "").join(" ")
    remember(LAST_COPY_KEY, `${new Date().toLocaleString()} · ${line}`)
    return {
      ok: outcome.kind === "done" && outcome.value.outcome.kind === "copied",
      line,
    }
  } catch (error) {
    // Asking home what it holds failed before anything was copied.
    const line = causedBy(error, HomeForgotPhoneError)
      ? `${host} no longer knows this phone: unpair, then pair again.`
      : causedBy(error, SyncStoppedError)
        ? STOPPED_EARLY
        : `Couldn't reach ${host}. Are you on the home network? Nothing was copied.`
    return { ok: false, line }
  }
}
