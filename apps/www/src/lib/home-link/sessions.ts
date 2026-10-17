/**
 * The sessions half of "Send to home" (`./send`): the phone's own sessions
 * copied into the paired home account (LA8). Only the session records go,
 * each one's plan, status and times (canon Rem. 7.6 (a)); reflections, stops
 * and soundbites stay on the phone (LA7). Nothing on home is deleted, and a
 * copy cannot be taken back from here.
 *
 * The point of copying is that the phone can let go. Once the copy has run,
 * home is asked for each finished session (`mayLeavePhone`) and the ones it
 * holds exactly as the phone does (`confirmHeld`, read back) leave the
 * phone; unfinished sessions and today's stay. A session that moved on since
 * its copy is brought up to date by the copy itself (`copySessionsTo`), so it
 * is held, and let go, the same time. The plan and receipt are
 * `lib/tenant/sessions-copy`'s.
 */
import type { FileHostTransport } from "@/lib/file-host-config/client"
import { createHttpSessionsRepository } from "@/lib/tenant/http-sessions-repository"
import { sessionsRepository } from "@/lib/tenant/queries"
import type { CopyResult, HeldReport } from "@/lib/tenant/sessions-copy"
import { confirmHeld, copySessionsTo } from "@/lib/tenant/sessions-copy"
import type { SessionRecord } from "@/lib/tenant/types"

import type { HomeSend } from "./runtime"

/** Home answered `401`: it no longer knows this phone. */
export class HomeForgotPhoneError extends Error {
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
export function causedBy(
  error: unknown,
  kind: new (...args: Array<never>) => Error
): boolean {
  if (error instanceof kind) return true
  return error instanceof Error && error.cause instanceof kind
}

/**
 * Copies `local` home through `send`, then reads back each of `leaving` into
 * `held`. A read that throws ends it, keeping the copy's result and what
 * `held` confirmed before it; a copy that cannot start throws.
 */
export async function copyAndConfirm(
  send: HomeSend,
  local: ReadonlyArray<SessionRecord>,
  leaving: ReadonlyArray<SessionRecord>,
  held: HeldReport
): Promise<{ copy: CopyResult; ended: unknown }> {
  const remote = createHttpSessionsRepository(homeTransport(send))
  const copy = await copySessionsTo(local, remote)
  // A copy that ended early has nothing more to ask home.
  if (copy.outcome.kind !== "copied") return { copy, ended: null }
  try {
    await confirmHeld(leaving, remote, held)
  } catch (error) {
    return { copy, ended: error }
  }
  return { copy, ended: null }
}

/**
 * Lets go of the phone's copies of `held`, each only if it is unchanged
 * since `read` (what home was compared against). Returns how many left.
 */
export async function letGoHeld(
  held: ReadonlyArray<string>,
  read: ReadonlyArray<SessionRecord>
): Promise<number> {
  if (held.length === 0) return 0
  const asRead = new Map(read.map((s) => [s.id, s.updatedAt]))
  const unchanged = (await sessionsRepository.list())
    .filter((s) => held.includes(s.id) && asRead.get(s.id) === s.updatedAt)
    .map((s) => s.id)
  if (unchanged.length > 0) await sessionsRepository.removeMany(unchanged)
  return unchanged.length
}
