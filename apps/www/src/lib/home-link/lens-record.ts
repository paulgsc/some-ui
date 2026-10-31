/**
 * The grammar-lens record's part of the one drain (`./drain`, LA15; HF5
 * #2180): each entry home does not hold as it is now, PUT to home's Korean
 * record as `lens` (paulgsc/server `routes::korean`, docs/identity.md
 * invariant 25, whose `lens` kind is this record), and counted as home's
 * only when home's answer carries the very entry sent. An entry is
 * rewritten on the phone when its item is seen further, and home keeps each
 * version as a revision, so `sent.lens` holds each entry's digest as home
 * read it back, and a changed entry goes again.
 *
 * Phone to home only. What home holds, as it is, may leave the phone to make
 * room at the record's bound (topik's `lensRecordHeldByHome`, which
 * `./voice-copy` hands `lensEntriesHeld`); nothing here lets anything go.
 */
import type { HomeCall } from "@some-ui/core-utils"
import {
  canonicalJson,
  fnv1a,
  isRecord,
  jsonOf,
  localStorageOrNull,
} from "@some-ui/core-utils"
import type { LensRecordExport } from "@some-ui/topik"

import { pairingOf } from "./index"
import type { LogReport } from "./leetype-log"
import { bucketOf } from "./leetype-log"
import type { Sent } from "./sent"
import { readSent } from "./sent"
import { answerOrEnd } from "./shelf"

export type LensEntry = LensRecordExport["entries"][number]

/**
 * An entry's key on home: its item (session, line, showing), as a key home
 * takes (letters, digits, `.`, `_`, `~` and `-`).
 */
export function lensKey(entry: LensEntry): string {
  return `${entry.session}~${entry.line}~${entry.shownAt}`.replace(
    /[^\w.~-]/g,
    "-"
  )
}

/** `sent.lens`' digest of an entry as it is now. */
export function lensDigest(entry: LensEntry): string {
  const text = canonicalJson(entry)
  return `${String(text.length)}:${String(fnv1a(text))}`
}

/** The entries home does not hold as they are now. */
export function lensToSend(
  entries: ReadonlyArray<LensEntry>,
  sent: Sent
): Array<LensEntry> {
  return entries.filter(
    (entry) => sent.lens[lensKey(entry)] !== lensDigest(entry)
  )
}

/** Whether home's answer carries `text` as the entry it now holds. */
function holds(body: string, text: string): boolean {
  const answer = jsonOf(body)
  return (
    isRecord(answer) &&
    isRecord(answer.entry) &&
    canonicalJson(answer.entry.body) === text
  )
}

/**
 * Sends `going` through `send`, into `report`, as `./notes` sends its
 * notes; `held` hears each key `sent.lens` should remember.
 */
export async function sendLens(
  going: ReadonlyArray<LensEntry>,
  send: HomeCall,
  report: LogReport,
  held: (key: string, digest: string) => void
): Promise<void> {
  for (const entry of going) {
    const key = lensKey(entry)
    const text = canonicalJson(entry)
    const answer = await answerOrEnd(
      send,
      report,
      "PUT",
      `/korean/lens/${encodeURIComponent(key)}`,
      text
    )
    if (answer === null) return
    const bucket = bucketOf(answer.status)
    if (bucket !== "held") {
      report[bucket] += 1
    } else if (holds(answer.body, text)) {
      report.held += 1
      held(key, lensDigest(entry))
    } else {
      report.differs += 1
    }
  }
}

/**
 * Whether the paired home holds each entry as it is now, as this phone last
 * heard: none while unpaired. One reading, made once per look at the record.
 */
export function lensEntriesHeld(): (entry: LensEntry) => boolean {
  const pairing = pairingOf()
  if (pairing === null) return () => false
  const { lens } = readSent(localStorageOrNull(), pairing)
  return (entry) => lens[lensKey(entry)] === lensDigest(entry)
}
