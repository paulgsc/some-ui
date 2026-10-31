/**
 * The one drain of what this phone holds to its paired home (LA15,
 * docs/learner-data-authority.md): what changed on this phone
 * since home last held it, in order. Finished sessions are copied as a copy
 * to home copies them (`./sessions`, reading home only to plan), kept shelf
 * items PUT as the shelf sends them (`./shelf`), each finished LeetType
 * session PUT event by event and read back (`./leetype-log`), then Studio's
 * sittings and answers the same way (`./studio-log`), then each written
 * reflection (`./reflections`, LA16). Nothing of home's is taken in, and
 * nothing on the phone is let go but written reflections (`letGoHeld`,
 * LA16): a finished session leaves only by the clear in Settings
 * (`./clear`), once home has read it back.
 *
 * A part home turned away (a full shelf, a refusal, a read-back that did not
 * match what was sent) does not hold back the parts after it, which share
 * nothing with it; the run says the first such end once every part has gone.
 * What did not go goes on the next ask.
 */
import type { HomeCall, HomeExchanged, KeyedStorage } from "@some-ui/core-utils"
import { unexpectedAnswer } from "@some-ui/core-utils"
import type { HomeSession } from "@some-ui/leetype"

import type { Kept } from "@/lib/device-backend/handlers/shelf"
import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import {
  FileHostNotConfiguredError,
  FileHostResponseError,
} from "@/lib/file-host-config/client"
import type { CopyResult } from "@/lib/tenant/sessions-copy"
import { SessionNotFoundError } from "@/lib/tenant/sessions-repository"
import type { SessionRecord } from "@/lib/tenant/types"

import type { LogReport } from "./leetype-log"
import { emptyLogReport, sendLog } from "./leetype-log"
import type { Written } from "./reflections"
import { sendReflections } from "./reflections"
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
import type { EndedReport } from "./shelf"
import { emptyReport, HomeUnansweredError, sendKept } from "./shelf"
import type { StudioGoing } from "./studio-log"
import { sendStudio } from "./studio-log"

/** Why a drain ended short, as `failed`'s `why`. */
type DrainWhy = "full" | "refused"

export type DrainPorts = {
  /** This phone's sessions and kept items (`./going`'s `readPhone`). */
  read: () => Promise<{
    local: ReadonlyArray<SessionRecord>
    kept: ReadonlyArray<Kept>
  }>
  /** The finished LeetType sessions home lacks under `pairing` (`./going`). */
  logGoing: () => Promise<ReadonlyArray<HomeSession>>
  /** What of Studio's record home lacks under `pairing` (`./going`). */
  studioGoing: () => Promise<StudioGoing>
  /** The written reflections home lacks under `pairing` (`./going`). */
  reflectionsGoing: () => ReadonlyArray<Written>
  /**
   * Lets go of the written reflections past the offline set that `sent`
   * says home holds (`./going`'s `letGoHeldReflections`).
   */
  letGoHeld: (sent: Sent) => void
  /** The pairing this run goes under (the link's id for it). */
  pairing: string
  storage: KeyedStorage | null
  /** The sessions copy (`./sessions`'s `copyHome`); a seam for tests. */
  copy?: (
    send: HomeCall,
    local: ReadonlyArray<SessionRecord>
  ) => Promise<CopyResult>
}

const failed = (why: DrainWhy): HomeExchanged => ({ kind: "failed", why })

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

/** How a part ended the run, when home did not answer it as asked: said or thrown. */
function endedPart(report: EndedReport): HomeExchanged | null {
  if (report.forgotten) return { kind: "forgotten" }
  if (report.unreachable) throw new HomeUnansweredError()
  return null
}

/** One log's sender (`./leetype-log`'s `sendLog`, `./studio-log`'s `sendStudio`). */
type LogSender<T> = (
  going: T,
  send: HomeCall,
  report: LogReport,
  held: (key: string, digest: string) => void
) => Promise<void>

/**
 * Sends what changed. Throws `HomeUnansweredError` when home does not answer
 * the shelf or a log, what the sessions copy throws when it does not answer
 * that (`./runtime`'s `unanswered` reads both), and any fault on this phone
 * as it came. A stop (Stop, or the app going to the background) ends it
 * before the next request, as the link's `send` refuses one.
 */
export async function drainHome(
  send: HomeCall,
  ports: DrainPorts
): Promise<HomeExchanged> {
  const { local, kept } = await ports.read()
  let sent: Sent = readSent(ports.storage, ports.pairing)

  const changed = sessionsToSend(local, sent)
  if (changed.length > 0) {
    let copy: CopyResult
    try {
      copy = await (ports.copy ?? copyHome)(send, changed)
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

  // A refusal counts only while its item is still kept here.
  const keys = new Set(kept.map(shelfKeyOf))
  sent = {
    ...sent,
    refused: Object.fromEntries(
      Object.entries(sent.refused).filter(([key]) => keys.has(key))
    ),
  }
  const shelf = await shelfToSend(kept, sent)
  const report = emptyReport()
  const held: Record<string, string> = {}
  const refused: Record<string, string> = {}
  try {
    await sendKept(shelf.changed, send, report, (item, answer) => {
      const key = shelfKeyOf(item)
      ;(answer === "held" ? held : refused)[key] = shelf.digests[key] ?? ""
    })
  } finally {
    sent = rememberSent(ports.storage, sent, { shelf: held, refused })
  }
  const shelfEnded = endedPart(report)
  if (shelfEnded !== null) return shelfEnded
  let short: DrainWhy | null =
    report.full.size > 0
      ? "full"
      : report.refused + report.other > 0
        ? "refused"
        : null

  /** Sends one log's `going`, remembering under `field` what home read back. */
  const part = async <T>(
    going: T,
    sender: LogSender<T>,
    field: "leetype" | "studio" | "reflections"
  ): Promise<HomeExchanged | null> => {
    const log = emptyLogReport()
    const readBack: Record<string, string> = {}
    try {
      await sender(going, send, log, (key, digest) => {
        readBack[key] = digest
      })
    } finally {
      sent = rememberSent(ports.storage, sent, { [field]: readBack })
    }
    if (log.refused + log.other + log.differs > 0) short ??= "refused"
    return endedPart(log)
  }
  const logEnded = await part(await ports.logGoing(), sendLog, "leetype")
  if (logEnded !== null) return logEnded
  const studioEnded = await part(
    await ports.studioGoing(),
    sendStudio,
    "studio"
  )
  if (studioEnded !== null) return studioEnded
  const reflectionsEnded = await part(
    ports.reflectionsGoing(),
    sendReflections,
    "reflections"
  )
  // What home holds, as this run has heard it, whatever the run came to.
  ports.letGoHeld(sent)
  if (reflectionsEnded !== null) return reflectionsEnded

  return short === null ? { kind: "synced" } : failed(short)
}
