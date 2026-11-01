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
 * the record"). Home's copy carries the session's plan, status and times,
 * and when it was made (`createdAt`).
 *
 * A failure that is not home's word or silence (home turning it away, a
 * fault on this phone) is reported (`reportFailure`), as the sync's are; the
 * plain delete's own failure is thrown, so the row shows it with a retry and
 * reports it as every intent's failure is (IR1, `lib/intent/report.ts`).
 */
import type { HomeCall } from "@some-ui/core-utils"
import type { ForeignFailure } from "@some-ui/intent-kit"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"

import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import {
  FileHostNotConfiguredError,
  FileHostResponseError,
} from "@/lib/file-host-config/client"
import { clearDurableFailure } from "@/lib/intent/durable-failure"
import { ForeignCallError } from "@/lib/intent/foreign"
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

/**
 * The phone's pairing as the let-go reads it: "unreadable" when its record is
 * there but could not be read just now, "unsure" while it is being read.
 */
export type Pairing = "paired" | "unpaired" | "unreadable" | "unsure"

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
  /**
   * It changed on the phone since the phone read it, before the copy, so
   * what home holds is not it as it is now; it stays.
   */
  | { readonly kind: "changed" }
  | { readonly kind: "unreachable" }
  | { readonly kind: "forgotten" }
  /** Home answered that it is busy. */
  | { readonly kind: "busy" }
  /** This phone's own link is busy, most often sending to home itself. */
  | { readonly kind: "phone-busy" }
  | { readonly kind: "stopped" }
  /** Home answered, and did not take it. */
  | { readonly kind: "refused"; readonly error: unknown }
  /** Home was promised, and the phone is not paired now. */
  | { readonly kind: "unpaired" }
  /** Home was promised, and the phone could not read its pairing just now. */
  | { readonly kind: "unreadable" }
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
  /** Where a failure goes to be read later: `reportFailure`. */
  report: (failure: ForeignFailure) => void
}

/** The port a let-go's failure is reported under. */
const PORT = "home-link"

/** The pairing in `state`. */
function pairingIn(state: HomeLinkState): Pairing {
  const { link } = state
  if (link.kind === "paired") return "paired"
  if (link.kind === "reading") return "unsure"
  return link.note === "unreadable" ? "unreadable" : "unpaired"
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
    report: reportFailure,
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
 * `refresh` with the end once the list changed (it left, or was gone
 * already), before it resolves, so a row that leaves with it still says so.
 * How it ended is said; only the plain delete's own failure is thrown.
 */
export async function letSessionGo(
  id: string,
  promised: LetGoPromise,
  refresh: (end: LetGoEnd) => unknown = () => undefined,
  ports: LetGoPorts = phonePorts()
): Promise<LetGoEnd> {
  const pairing = await ports.pairing()
  if (pairing === "unpaired" && promised === "phone-only") {
    await ports.remove(id)
    return said(refresh, { kind: "deleted" })
  }
  const end = await keptHome(id, pairing, refresh, ports)
  if (reportedAlready(end)) return end
  if (end.kind === "not-let-go") {
    ports.report({
      port: PORT,
      error: {
        ...toIntentError(end.error),
        summary: end.held
          ? "Home holds a session this phone couldn't let go."
          : "This phone couldn't let a session go.",
      },
    })
  } else if (end.kind === "refused") {
    ports.report({
      port: PORT,
      error: {
        ...toIntentError(end.error),
        summary: "Home didn't take a session it was asked to keep.",
      },
    })
  }
  return end
}

/** A let-go's end, with the host its question named. */
export type LetGoRun = { readonly end: LetGoEnd; readonly host: string }

/**
 * `letSessionGo`, with the host the question named kept beside its end, so
 * what a control says of that end names the host it asked about, however
 * the pairing moved since.
 */
export async function letSessionGoFor(
  host: string,
  id: string,
  promised: LetGoPromise,
  refresh: (end: LetGoEnd) => unknown = () => undefined,
  ports: LetGoPorts = phonePorts()
): Promise<LetGoRun> {
  return { end: await letSessionGo(id, promised, refresh, ports), host }
}

/**
 * A failure a native call already reported (`callForeign` reports before it
 * throws `ForeignCallError`), anywhere in the cause chain, as IR1 skips it.
 */
function reportedAlready(end: LetGoEnd): boolean {
  if (end.kind !== "not-let-go" && end.kind !== "refused") return false
  for (
    let cause: unknown = end.error;
    cause instanceof Error;
    cause = cause.cause
  ) {
    if (cause instanceof ForeignCallError) return true
  }
  return false
}

/** Why `pairing` keeps the session, when it is not "paired". */
function notPaired(pairing: Pairing): LetGoEnd | null {
  if (pairing === "paired") return null
  return pairing === "unreadable"
    ? { kind: "unreadable" }
    : { kind: "unpaired" }
}

/** The copy home, the read back and the let-go, on a paired phone. */
async function keptHome(
  id: string,
  pairing: Pairing,
  refresh: (end: LetGoEnd) => unknown,
  ports: LetGoPorts
): Promise<LetGoEnd> {
  const unpaired = notPaired(pairing)
  if (unpaired !== null) return unpaired
  let session: SessionRecord | null
  try {
    session = await ports.session(id)
  } catch (error) {
    return { kind: "not-let-go", held: false, error }
  }
  if (session === null) return said(refresh, { kind: "missing" })
  const asked = session
  let read: Read
  try {
    const run = await ports.run((send) => copyThenRead(send, asked))
    // The link runs nothing while busy, or once the phone is unpaired.
    if (run === null)
      return notPaired(await ports.pairing()) ?? { kind: "phone-busy" }
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
  return said(refresh, { kind: "kept-home" })
}

/** `end`, once `refresh` has been told it. */
function said(refresh: (end: LetGoEnd) => unknown, end: LetGoEnd): LetGoEnd {
  refresh(end)
  return end
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
    return { kind: "refused", error }
  }
  return { kind: "not-let-go", held: false, error }
}
