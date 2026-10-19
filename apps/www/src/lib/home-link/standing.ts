/**
 * One standing send for Practice (LA11, docs/learner-data-authority.md):
 * what changed on this phone since home last held it, for what its person
 * keeps sending. Sessions are copied as "Send to home" copies them
 * (`./sessions`), reading home only to plan the copy, kept shelf items PUT
 * as it PUTs them (`./shelf`), and nothing of home's is taken in or lets a
 * phone session go: freeing the phone stays a tap in Settings (`./send`).
 *
 * What did not go goes on the next ask; home being busy is said by the lane
 * that runs this (`./lanes`).
 */
import type { HomeExchanged } from "@some-ui/core-utils"

import type { Kept } from "@/lib/device-backend/handlers/shelf"
import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import type { CopyResult } from "@/lib/tenant/sessions-copy"
import type { SessionRecord } from "@/lib/tenant/types"

import type { Scope } from "./consent-model"
import type { HomeSend } from "./runtime"
import type { Sent } from "./sent"
import {
  readSent,
  rememberSent,
  sessionsHeld,
  sessionsToSend,
  shelfHeld,
  shelfKeyOf,
} from "./sent"
import { causedBy, copyHome, HomeForgotPhoneError } from "./sessions"
import { emptyReport, sendKept } from "./shelf"

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
    send: HomeSend,
    local: ReadonlyArray<SessionRecord>
  ) => Promise<CopyResult>
}

const failed = (why: StandingWhy): HomeExchanged => ({ kind: "failed", why })

/**
 * Sends what changed; throws what `send` throws when home does not answer.
 * Every request first asks the log again (`gated`), so a stop pressed while
 * a send runs ends it before its next request.
 */
export async function sendStanding(
  send: HomeSend,
  ports: StandingPorts
): Promise<HomeExchanged> {
  if (ports.shared().size === 0) return { kind: "synced" }
  const gated =
    (scope: Scope): HomeSend =>
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
        if (causedBy(error, HomeForgotPhoneError)) return { kind: "forgotten" }
        if (causedBy(error, SyncStoppedError)) throw new SyncStoppedError()
        throw error
      }
      const { outcome } = copy
      if (outcome.kind === "partial") {
        if (causedBy(outcome.error, HomeForgotPhoneError)) {
          return { kind: "forgotten" }
        }
        if (causedBy(outcome.error, SyncStoppedError)) {
          throw new SyncStoppedError()
        }
        throw outcome.error
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
    const digests = await shelfHeld(kept)
    const changed = kept.filter((item) => {
      const digest = digests[shelfKeyOf(item)]
      return (
        sent.shelf[shelfKeyOf(item)] !== digest &&
        sent.refused[shelfKeyOf(item)] !== digest
      )
    })
    const report = emptyReport()
    const held: Record<string, string> = {}
    const refused: Record<string, string> = {}
    try {
      await sendKept(changed, gated("shelf"), report, (item, answer) => {
        const key = shelfKeyOf(item)
        ;(answer === "held" ? held : refused)[key] = digests[key] ?? ""
      })
    } finally {
      sent = rememberSent(ports.storage, sent, { shelf: held, refused })
    }
    if (report.forgotten) return { kind: "forgotten" }
    if (report.unreachable) throw new Error("home did not answer")
    if (report.full.size > 0) return failed("full")
    if (report.refused + report.other > 0) return failed("refused")
  }

  return { kind: "synced" }
}
