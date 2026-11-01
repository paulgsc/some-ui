/**
 * The study list's "Let it go" (LA8, docs/learner-data-authority.md): on a
 * paired phone, the one session the person named is copied home whatever
 * its status (`./sessions`' `copyHome`), read back (`readHeld`), and the
 * phone lets its own copy go only if home holds it exactly as the phone does
 * and it is unchanged since it was read (`letGoUnchanged`). Anything short of
 * that keeps it on the phone and says why (`./words`' `LET_GO.ended`).
 *
 * On a phone that is not paired there is no home to keep a copy, so the
 * session is deleted as it always was, after a confirm that says it can't be
 * brought back. Which of the two the confirm promised (`promiseOf`) is
 * passed in: a promise of home is never kept by a plain delete, so a phone
 * unpaired between the confirm and the tap keeps the session.
 *
 * One request run, no retry: a run the link is already busy with, or one
 * Stop or the background ends, keeps the session (CLAUDE.md, "Never lose
 * the record").
 */
import type { HomeCall } from "@some-ui/core-utils"

import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import {
  FileHostNotConfiguredError,
  FileHostResponseError,
} from "@/lib/file-host-config/client"
import { clearDurableFailure } from "@/lib/intent/durable-failure"
import { sessionsRepository } from "@/lib/tenant/queries"
import { emptyHeldReport } from "@/lib/tenant/sessions-copy"
import { SessionNotFoundError } from "@/lib/tenant/sessions-repository"
import type { SessionRecord } from "@/lib/tenant/types"

import type { HomeLink, HomeLinkState } from "./index"
import { homeLink } from "./index"
import { letGoUnchanged } from "./let-go"
import { noticingBusy, unanswered } from "./runtime"
import { causedBy, copyHome, HomeForgotPhoneError, readHeld } from "./sessions"

/** What the confirm said happens: home keeps it, or nothing does. */
export type LetGoPromise = "home" | "phone-only"

/** The phone's pairing as the let-go reads it, once its record is read. */
export type Pairing = "paired" | "unpaired" | "unsure"

/** How a let-go ended, for its line (`./words`' `LET_GO.ended`). */
export type LetGoEnd =
  /** Gone from this phone; home holds it as it was. */
  | { readonly kind: "kept-home" }
  /** Gone from this phone, which is not paired: no copy anywhere. */
  | { readonly kind: "deleted" }
  /** It was no longer on this phone. */
  | { readonly kind: "missing" }
  /** Home does not hold it as the phone does, so it stays. */
  | { readonly kind: "not-held" }
  /** It changed on the phone after home read it back, so it stays. */
  | { readonly kind: "changed" }
  | { readonly kind: "unreachable" }
  | { readonly kind: "forgotten" }
  | { readonly kind: "busy" }
  | { readonly kind: "stopped" }
  /** Home answered, and did not take it. */
  | { readonly kind: "refused" }
  /** Home was promised, and the phone is not paired now. */
  | { readonly kind: "unpaired" }
  /** This phone could not let it go: `held` says whether home holds it. */
  | {
      readonly kind: "not-let-go"
      readonly held: boolean
      readonly error: unknown
    }

export type LetGoPorts = {
  /** The phone's own copy of a session, read afresh. */
  session: (id: string) => Promise<SessionRecord | null>
  /** The pairing, once the link has read the phone's own record. */
  pairing: () => Promise<Pairing>
  /** One run of the paired link: `homeLink().send`. */
  run: HomeLink["send"]
  /** Lets go of what home holds, unchanged since read; how many left. */
  letGo: (held: ReadonlyArray<SessionRecord>) => Promise<number>
  /** Today's delete, for a phone that is not paired. */
  remove: (id: string) => Promise<void>
}

/** The pairing in `state`; "unsure" while it is read, or can't be. */
function pairingIn(state: HomeLinkState): Pairing {
  const { link } = state
  if (link.kind === "paired") return "paired"
  if (link.kind === "unpaired" && link.note !== "unreadable") {
    return "unpaired"
  }
  return "unsure"
}

/**
 * What the confirm may promise in `state`: no copy only on a phone known to
 * be unpaired. While the pairing is unsure, home is promised, so nothing is
 * deleted without one.
 */
export function promiseOf(state: HomeLinkState): LetGoPromise {
  return pairingIn(state) === "unpaired" ? "phone-only" : "home"
}

/** The ends where the session left this phone. */
export function leftPhone(end: LetGoEnd): boolean {
  return end.kind === "kept-home" || end.kind === "deleted"
}

function phonePorts(): LetGoPorts {
  return {
    session: (id) => sessionsRepository.get(id),
    pairing: async (): Promise<Pairing> => {
      const link = homeLink()
      await link.load()
      return pairingIn(link.getSnapshot())
    },
    run: (r) => homeLink().send(r),
    letGo: async (held): Promise<number> => {
      const left = await letGoUnchanged(held)
      // As `sessionsRepository.remove` does: nothing left to warn about.
      if (left > 0) for (const { id } of held) clearDurableFailure(id)
      return left
    },
    remove: (id) => sessionsRepository.remove(id),
  }
}

/** What one run of copy-then-read found. */
type Read = {
  readonly ended: unknown
  readonly busy: boolean
  readonly held: boolean
}

/** Copies `session` home, then reads it back; never throws. */
async function copyThenRead(
  send: HomeCall,
  session: SessionRecord
): Promise<Read> {
  const noticed = noticingBusy(send)
  try {
    const copied = await copyHome(noticed.send, [session])
    if (copied.outcome.kind === "partial") {
      return {
        ended: copied.outcome.error,
        busy: noticed.seen.busy,
        held: false,
      }
    }
  } catch (error) {
    return { ended: error, busy: noticed.seen.busy, held: false }
  }
  const report = emptyHeldReport()
  const read = await readHeld(send, [session], report)
  return {
    ended: read.ended,
    busy: read.busy || noticed.seen.busy,
    held: report.held.includes(session.id),
  }
}

/**
 * Lets the session `id` go as `promised` says: home keeps it first on a
 * paired phone, and on one known to be unpaired it is deleted. Calls
 * `refresh` once it left. Never throws: how it ended is said.
 */
export async function letSessionGo(
  id: string,
  promised: LetGoPromise,
  refresh: () => unknown = () => undefined,
  ports: LetGoPorts = phonePorts()
): Promise<LetGoEnd> {
  let session: SessionRecord | null
  let pairing: Pairing
  try {
    pairing = await ports.pairing()
    if (pairing === "unpaired" && promised === "phone-only") {
      await ports.remove(id)
      refresh()
      return { kind: "deleted" }
    }
    if (pairing !== "paired") return { kind: "unpaired" }
    session = await ports.session(id)
  } catch (error) {
    return { kind: "not-let-go", held: false, error }
  }
  if (session === null) {
    refresh()
    return { kind: "missing" }
  }
  const asked = session
  let read: Read
  try {
    const run = await ports.run((send) => copyThenRead(send, asked))
    if (run === null) return { kind: "busy" }
    if (run.kind === "stopped") return { kind: "stopped" }
    read = run.value
  } catch (error) {
    return endOf(error, false)
  }
  if (read.ended !== null) return endOf(read.ended, read.busy)
  if (!read.held) return { kind: "not-held" }
  let left: number
  try {
    left = await ports.letGo([asked])
  } catch (error) {
    return { kind: "not-let-go", held: true, error }
  }
  if (left === 0) return { kind: "changed" }
  refresh()
  return { kind: "kept-home" }
}

/** Why a run ended before home held the session. */
function endOf(error: unknown, busy: boolean): LetGoEnd {
  if (causedBy(error, SyncStoppedError)) return { kind: "stopped" }
  if (causedBy(error, HomeForgotPhoneError)) return { kind: "forgotten" }
  if (busy) return { kind: "busy" }
  if (unanswered(error)) return { kind: "unreachable" }
  if (
    causedBy(error, FileHostResponseError) ||
    causedBy(error, FileHostNotConfiguredError) ||
    causedBy(error, SessionNotFoundError)
  ) {
    return { kind: "refused" }
  }
  return { kind: "not-let-go", held: false, error }
}
