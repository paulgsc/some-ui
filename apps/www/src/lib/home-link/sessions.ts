/**
 * "Copy sessions to home": the phone's own sessions copied into the paired
 * home account, after a tap and a confirm that names the count and the host
 * (LA8). Only the session records go, each one's plan, status and times
 * (canon Rem. 7.6 (a)); reflections, stops and soundbites stay on the phone
 * (LA7). One way: home is asked only what the copy needs to skip what it
 * already holds, nothing there is deleted, and a copy cannot be taken back
 * from here.
 *
 * The plan and receipt are `lib/tenant/sessions-transfer`'s, so a second
 * press copies nothing new, and a create whose answer was lost is found
 * before another is sent.
 */
import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import type { FileHostTransport } from "@/lib/file-host-config/client"
import { createHttpSessionsRepository } from "@/lib/tenant/http-sessions-repository"
import { sessionsRepository } from "@/lib/tenant/queries"
import type { CopyResult } from "@/lib/tenant/sessions-transfer"
import { copySessionsTo } from "@/lib/tenant/sessions-transfer"

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

/** Does `error`, or anything it was caused by, pass `is`? */
function causedBy(error: unknown, is: (cause: Error) => boolean): boolean {
  let at: unknown = error
  while (at instanceof Error) {
    if (is(at)) return true
    at = at.cause
  }
  return false
}

const stopped = (cause: Error): boolean => cause instanceof SyncStoppedError
const forgotten = (cause: Error): boolean =>
  cause instanceof HomeForgotPhoneError

const sessions = (n: number): string => `${n} session${n === 1 ? "" : "s"}`

/** What a copy would consider, for its confirm. Reads only this phone. */
export async function sessionsOnPhone(): Promise<ToSend> {
  const total = (await sessionsRepository.list()).length
  return { total, what: sessions(total) }
}

/** The copy's end in the block's words. */
export function describeCopy(result: CopyResult, host: string): string {
  const { outcome, alreadyThere } = result
  const there =
    alreadyThere > 0 ? ` ${sessions(alreadyThere)} were already there.` : ""
  if (outcome.kind === "copied") {
    return `Copied ${sessions(outcome.copied)} to ${host}.${there}`
  }
  const { copied, remaining, error } = outcome
  const sent = `Copied ${sessions(copied)} to ${host}; ${remaining} not yet.`
  if (causedBy(error, stopped)) {
    return `Stopped. ${sent} Copy again to carry on.${there}`
  }
  if (causedBy(error, forgotten)) {
    return `${sent} ${host} no longer knows this phone: unpair, then pair again.${there}`
  }
  return `${sent} Lost ${host} there; copy again to carry on.${there}`
}

/** "time · what happened" for the last copy, or "". */
export function lastCopy(): string {
  return remembered(LAST_COPY_KEY)
}

/**
 * Copies this phone's sessions to the paired `base`. Never throws: a
 * failure is a line.
 */
export async function copySessionsHome(base: string): Promise<SyncResult> {
  const host = hostOf(base)
  let local: Awaited<ReturnType<typeof sessionsRepository.list>>
  try {
    local = await sessionsRepository.list()
  } catch (error) {
    return {
      ok: false,
      line: `Couldn't read this phone's sessions: ${String(error)}`,
    }
  }
  try {
    const outcome = await homeLink().send((send) =>
      copySessionsTo(local, createHttpSessionsRepository(homeTransport(send)))
    )
    if (outcome === null) return { ok: false, line: "" }
    const line =
      outcome.kind === "stopped"
        ? "Stopped before anything was copied."
        : describeCopy(outcome.value, host)
    remember(LAST_COPY_KEY, `${new Date().toLocaleString()} · ${line}`)
    return {
      ok: outcome.kind === "done" && outcome.value.outcome.kind === "copied",
      line,
    }
  } catch (error) {
    // Asking home what it holds failed before anything was copied.
    const line = causedBy(error, forgotten)
      ? `${host} no longer knows this phone: unpair, then pair again.`
      : causedBy(error, stopped)
        ? "Stopped before anything was copied."
        : `Couldn't reach ${host}. Are you on the home network? Nothing was copied.`
    return { ok: false, line }
  }
}
