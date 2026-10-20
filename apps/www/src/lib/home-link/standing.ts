/**
 * One standing send for Practice (LA11, docs/learner-data-authority.md):
 * what changed on this phone since home last held it, for what its person
 * keeps sending. Sessions are copied as "Send to home" copies them
 * (`./sessions`), reading home only to plan the copy, kept shelf items PUT
 * as it PUTs them (`./shelf`), and nothing of home's is taken in or lets a
 * phone session go: freeing the phone stays a tap in Settings (`./send`).
 *
 * What did not go goes on the next ask.
 */
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"
import { unexpectedAnswer } from "@some-ui/core-utils"

import type { Kept } from "@/lib/device-backend/handlers/shelf"
import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import {
  FileHostNotConfiguredError,
  FileHostResponseError,
} from "@/lib/file-host-config/client"
import type { CopyResult } from "@/lib/tenant/sessions-copy"
import { SessionNotFoundError } from "@/lib/tenant/sessions-repository"
import type { SessionRecord } from "@/lib/tenant/types"

import type { Scope } from "./consent-model"
import type { Sent } from "./sent"
import {
  readSent,
  rememberSent,
  sessionsHeld,
  sessionsToSend,
  shelfKeyOf,
  shelfToSend,
} from "./sent"
import { causedBy, copyHome, HomeForgotPhoneError } from "./sessions"
import { emptyReport, HomeUnansweredError, sendKept } from "./shelf"

/** Why a standing send ended short, as `failed`'s `why`. */
type StandingWhy = "full" | "refused"

export type StandingPorts = {
  /** This phone's sessions and kept items. */
  read: () => Promise<{
    local: ReadonlyArray<SessionRecord>
    kept: ReadonlyArray<Kept>
  }>
  /** What its person keeps sending under `pairing`, read before every request. */
  shared: () => ReadonlySet<Scope>
  /** The pairing this send goes under (the link's id for it). */
  pairing: string
  storage: Pick<Storage, "getItem" | "setItem"> | null
  /** The sessions copy (`./sessions`'s `copyHome`); a seam for tests. */
  copy?: (
    send: HomeCall,
    local: ReadonlyArray<SessionRecord>
  ) => Promise<CopyResult>
}

const failed = (why: StandingWhy): HomeExchanged => ({ kind: "failed", why })

/** How the sessions copy ended at `error`, when home answered it: said, not thrown. */
function answeredCopy(error: unknown): HomeExchanged | null {
  if (causedBy(error, HomeForgotPhoneError)) return { kind: "forgotten" }
  if (causedBy(error, SyncStoppedError)) throw new SyncStoppedError()
  if (error instanceof FileHostResponseError) {
    return unexpectedAnswer("a session", error.status)
  }
  // A 503 that is not home's busy, and a 404 for a copy gone since the plan.
  if (error instanceof FileHostNotConfiguredError) {
    return unexpectedAnswer("a session", 503)
  }
  return error instanceof SessionNotFoundError
    ? unexpectedAnswer("a session", 404)
    : null
}

/**
 * Sends what changed. Throws `HomeUnansweredError` when home does not answer
 * the shelf, what the sessions copy throws when it does not answer that
 * (`./runtime`'s `unanswered` reads both), and any fault on this phone as
 * it came. Every request first asks the log again (`gated`), so a stop
 * pressed while a send runs ends it before its next request.
 */
export async function sendStanding(
  send: HomeCall,
  ports: StandingPorts
): Promise<HomeExchanged> {
  const gated =
    (scope: Scope): HomeCall =>
    (method, path, body) =>
      ports.shared().has(scope)
        ? send(method, path, body)
        : Promise.reject(new SyncStoppedError())
  const { local, kept } = await ports.read()
  let sent: Sent = readSent(ports.storage, ports.pairing)

  if (ports.shared().has("sessions")) {
    const changed = sessionsToSend(local, sent)
    if (changed.length > 0) {
      let copy: CopyResult
      try {
        copy = await (ports.copy ?? copyHome)(gated("sessions"), changed)
      } catch (error) {
        const ended = answeredCopy(error)
        if (ended === null) throw error
        return ended
      }
      const { outcome } = copy
      if (outcome.kind === "partial") {
        const ended = answeredCopy(outcome.error)
        if (ended === null) throw outcome.error
        return ended
      }
      sent = rememberSent(ports.storage, sent, {
        sessions: sessionsHeld(changed),
      })
    }
  }

  if (ports.shared().has("shelf")) {
    // A refusal counts only while its item is still kept here.
    const keys = new Set(kept.map(shelfKeyOf))
    sent = {
      ...sent,
      refused: Object.fromEntries(
        Object.entries(sent.refused).filter(([key]) => keys.has(key))
      ),
    }
    const { changed, digests } = await shelfToSend(kept, sent)
    const report = emptyReport()
    const held: Record<string, string> = {}
    const refused: Record<string, string> = {}
    try {
      await sendKept(changed, gated("shelf"), report, (item, answer) => {
        const key = shelfKeyOf(item)
        ;(answer === "held" ? held : refused)[key] = digests[key] ?? ""
      })
    } finally {
      rememberSent(ports.storage, sent, { shelf: held, refused })
    }
    if (report.forgotten) return { kind: "forgotten" }
    if (report.unreachable) throw new HomeUnansweredError()
    if (report.full.size > 0) return failed("full")
    if (report.refused + report.other > 0) return failed("refused")
  }

  return { kind: "synced" }
}
