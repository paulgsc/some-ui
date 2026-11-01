/**
 * The sessions half of the drain (`./drain`): the phone's own finished
 * sessions copied into the paired home account (LA8, LA15). Only the
 * session records go, each one's plan, status and times (canon Rem. 7.6
 * (a)); stops and soundbites stay on the phone, and written reflections go
 * as the drain's own part (`./reflections`, LA16). Nothing
 * on home is deleted, and a copy cannot be taken back from here.
 *
 * The clear (`./clear`) reads the finished sessions back (`readHeld`,
 * `confirmHeld`), so it lets go of those home holds exactly; the study
 * list's "Let it go" (`./study-let-go`) copies its one session, of any
 * status, then reads it back the same way. The plan and receipt are
 * `lib/tenant/sessions-copy`'s.
 */
import type { HomeCall } from "@some-ui/core-utils"

import type { FileHostTransport } from "@/lib/file-host-config/client"
import { createHttpSessionsRepository } from "@/lib/tenant/http-sessions-repository"
import type { CopyResult, HeldReport } from "@/lib/tenant/sessions-copy"
import { confirmHeld, copySessionsTo } from "@/lib/tenant/sessions-copy"
import type { SessionRecord } from "@/lib/tenant/types"

import { noticingBusy } from "./runtime"

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
export function homeTransport(send: HomeCall): FileHostTransport {
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
 * Copies `local` home through `send`, reading home only to plan the copy,
 * and confirms nothing: the drain's half (`./drain`), which never lets a
 * phone session go, and the first half of the study list's "Let it go"
 * (`./study-let-go`), which reads back before it does.
 */
export function copyHome(
  send: HomeCall,
  local: ReadonlyArray<SessionRecord>
): Promise<CopyResult> {
  return copySessionsTo(
    local,
    createHttpSessionsRepository(homeTransport(send))
  )
}

/**
 * Reads back each of `leaving` from home into `held` (`confirmHeld`), for
 * the clear (`./clear`) and the study list's "Let it go"
 * (`./study-let-go`): what ended it, if anything did, and whether home
 * answered any read as busy. Sends nothing.
 */
export async function readHeld(
  send: HomeCall,
  leaving: ReadonlyArray<SessionRecord>,
  held: HeldReport
): Promise<{ ended: unknown; busy: boolean }> {
  const noticed = noticingBusy(send)
  const remote = createHttpSessionsRepository(homeTransport(noticed.send))
  try {
    await confirmHeld(leaving, remote, held)
  } catch (error) {
    return { ended: error, busy: noticed.seen.busy }
  }
  return { ended: null, busy: noticed.seen.busy }
}
