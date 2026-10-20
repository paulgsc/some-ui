/**
 * The session log as kept on the device, under the same rules as
 * `apps/www/src/lib/jobs/stored.ts`, since it is the owner's record and the
 * device may hold its only copy:
 *
 * - one `localStorage` key per session (`sessionKey`), listed in order by
 *   one index key, so an append rewrites one session and not the whole log;
 * - each append re-reads the index and the session first, so a second store
 *   over the same storage adds to what the first kept instead of writing
 *   over it, and lists a session before writing it, so no kept session is
 *   ever left out of the index;
 * - a session's value that does not parse, or is another version, is moved
 *   aside to a key of its own (`<key>:unreadable:<n>`) and stays there;
 * - an index that does not parse is left as it is and the log opens
 *   read-only: moving it aside would hide every session it lists;
 * - when the storage throws on reading, the log opens read-only.
 *
 * On the Pages build `localStorage` is the viewer's in-memory copy
 * (`apps/www/src/lib/demo/viewer-storage.ts`), so nothing is kept there.
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import { openRecord, readAs, writeRecord } from "@some-ui/core-utils"
import { z } from "zod"

import type { SessionEvent, SessionLog } from "./model"
import { append, SessionEventSchema, SessionIdSchema } from "./model"

export const INDEX_KEY = "leetype:session-log"
/** Session ids hold no `:` (`model.ts`), so no session's key is another's moved-aside copy. */
export const sessionKey = (session: string): string =>
  `leetype:session-log:session:${session}`
const VERSION = 1

const IndexSchema = z.strictObject({
  v: z.literal(VERSION),
  sessions: z.array(SessionIdSchema),
})
const SessionSchema = z.strictObject({
  v: z.literal(VERSION),
  events: z.array(SessionEventSchema),
})
const parseIndex = (raw: string): z.infer<typeof IndexSchema> | null =>
  readAs(IndexSchema, raw)
const parseSession = (raw: string): z.infer<typeof SessionSchema> | null =>
  readAs(SessionSchema, raw)

/** The index's sessions, or null when it threw or does not parse. */
function readIndex(storage: KeyedStorage): ReadonlyArray<string> | null {
  try {
    const raw = storage.getItem(INDEX_KEY)
    return raw === null ? [] : (parseIndex(raw)?.sessions ?? null)
  } catch {
    return null
  }
}

/** One session's events, `[]` for none (or one now moved aside), or null when the storage threw. */
function readSession(
  storage: KeyedStorage,
  session: string
): SessionLog | null {
  const key = sessionKey(session)
  const opened = openRecord(storage, key, parseSession, `${key}:unreadable:`)
  if (opened.kind === "unreadable") return null
  return opened.kind === "kept" ? opened.value.events : []
}

/** Every kept session's events, in the order the sessions started, or null if the log cannot be read. */
export function openStored(
  storage: KeyedStorage
): ReadonlyMap<string, SessionLog> | null {
  const sessions = readIndex(storage)
  if (sessions === null) return null
  const log = new Map<string, SessionLog>()
  for (const session of sessions) {
    const events = readSession(storage, session)
    if (events === null) return null
    log.set(session, events)
  }
  return log
}

/**
 * Adds `event` to its session as kept now, listing the session first; the
 * session's events after, or null when the device kept nothing new.
 */
export function appendStored(
  storage: KeyedStorage,
  event: SessionEvent
): SessionLog | null {
  const sessions = readIndex(storage)
  if (sessions === null) return null
  if (
    !sessions.includes(event.session) &&
    !writeRecord(
      storage,
      INDEX_KEY,
      JSON.stringify({ v: VERSION, sessions: [...sessions, event.session] }),
      parseIndex
    )
  ) {
    return null
  }
  const kept = readSession(storage, event.session)
  if (kept === null) return null
  const events = append(kept, event)
  if (events === kept) return events
  const written = writeRecord(
    storage,
    sessionKey(event.session),
    JSON.stringify({ v: VERSION, events }),
    parseSession
  )
  return written ? events : null
}
