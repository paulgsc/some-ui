/**
 * The one tap that lets something leave this phone for home's sake (LA8,
 * docs/learner-data-authority.md): Settings' "Clear finished sessions home
 * holds". It reads each finished session (`mayLeavePhone`: completed, not
 * today's) back from home (`./sessions`' `readHeld`) and lets go of those
 * alone that home holds exactly as the phone does, each unchanged since it
 * was read (`letGoUnchanged`). It sends nothing: the drain (`./drain`) has
 * already copied them, and a session home does not hold yet stays.
 *
 * A tap, with a second press, because it discards from the phone: the owner
 * decides when a finished session may leave (CLAUDE.md, "Never lose the
 * record").
 */
import { mayLeavePhone } from "@/lib/device-backend/handlers/sessions"
import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import { sessionsRepository } from "@/lib/tenant/queries"
import type { HeldReport } from "@/lib/tenant/sessions-copy"
import { emptyHeldReport } from "@/lib/tenant/sessions-copy"
import type { SessionRecord } from "@/lib/tenant/types"

import type { HomeLink } from "./index"
import { homeLink } from "./index"
import { letGoUnchanged } from "./let-go"
import { causedBy, HomeForgotPhoneError, readHeld } from "./sessions"

/** How a clear ended, for its line (`./words`' `CLEAR.ended`). */
export type ClearEnd =
  /** Home was read, and `freed` sessions left; `kept` it did not hold as they are. */
  | { readonly kind: "cleared"; readonly freed: number; readonly kept: number }
  | { readonly kind: "nothing" }
  | { readonly kind: "unreachable" }
  | { readonly kind: "forgotten" }
  | { readonly kind: "busy" }
  | { readonly kind: "stopped" }
  /** This phone could not let them go: `error` says why. */
  | { readonly kind: "not-cleared"; readonly error: unknown }

export type ClearPorts = {
  /** This phone's sessions. */
  sessions: () => Promise<ReadonlyArray<SessionRecord>>
  /** One read of the paired link: `homeLink().send`. */
  run: HomeLink["send"]
  /** Lets go of what home holds, unchanged since read; how many left. */
  letGo: (sessions: ReadonlyArray<SessionRecord>) => Promise<number>
}

function phonePorts(): ClearPorts {
  return {
    sessions: () => sessionsRepository.list(),
    run: (r) => homeLink().send(r),
    letGo: letGoUnchanged,
  }
}

/** Of `local`, the finished sessions a clear asks home about at `now`. */
const leavingOf = (
  local: ReadonlyArray<SessionRecord>,
  now: Date
): Array<SessionRecord> => local.filter((s) => mayLeavePhone(s, now))

/** The finished sessions a clear would ask home about now. */
export async function finishedOnPhone(
  now = new Date(),
  ports: ClearPorts = phonePorts()
): Promise<number> {
  return leavingOf(await ports.sessions(), now).length
}

/**
 * Reads back each finished session and lets go of those home holds as they
 * are; calls `refresh` once any left. Never throws: how it ended is said.
 */
export async function clearHeld(
  refresh: () => unknown = () => undefined,
  now = new Date(),
  ports: ClearPorts = phonePorts()
): Promise<ClearEnd> {
  const local = await ports.sessions()
  const leaving = leavingOf(local, now)
  if (leaving.length === 0) return { kind: "nothing" }
  const held: HeldReport = emptyHeldReport()
  let read: { ended: unknown; busy: boolean }
  try {
    const run = await ports.run((send) => readHeld(send, leaving, held))
    if (run === null) return { kind: "busy" }
    if (run.kind === "stopped") return { kind: "stopped" }
    read = run.value
  } catch (error) {
    return endOf(error)
  }
  if (read.ended !== null) return endOf(read.ended, read.busy)
  let freed: number
  try {
    freed = await ports.letGo(local.filter((s) => held.held.includes(s.id)))
  } catch (error) {
    return { kind: "not-cleared", error }
  }
  if (freed > 0) refresh()
  return { kind: "cleared", freed, kept: leaving.length - freed }
}

function endOf(error: unknown, busy = false): ClearEnd {
  if (causedBy(error, SyncStoppedError)) return { kind: "stopped" }
  if (causedBy(error, HomeForgotPhoneError)) return { kind: "forgotten" }
  if (busy) return { kind: "busy" }
  return { kind: "unreachable" }
}
