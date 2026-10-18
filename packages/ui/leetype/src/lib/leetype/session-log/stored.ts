/**
 * The session log as kept on the device, under the same rules as
 * `apps/www/src/lib/jobs/stored.ts`, since it is the owner's record and the
 * device may hold its only copy:
 *
 * - one `localStorage` key per session (`sessionKey`), listed in order by
 *   one index key, so an append rewrites one session and not the whole log;
 * - each append re-reads the session and the index first, so a second store
 *   over the same storage adds to what the first kept instead of writing
 *   over it;
 * - a value that does not parse, or is another version, is moved aside to a
 *   key of its own (`<key>:unreadable:<n>`) and stays there;
 * - when the storage throws on reading, the log opens read-only.
 *
 * On the Pages build `localStorage` is the viewer's in-memory copy
 * (`apps/www/src/lib/demo/viewer-storage.ts`), so nothing is kept there.
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import { openRecord, writeRecord } from "@some-ui/core-utils"
import { z } from "zod"

import type { SessionEvent, SessionLog } from "./model"
import { append, SessionEventSchema } from "./model"

export const INDEX_KEY = "leetype:session-log"
export const sessionKey = (session: string): string =>
  `leetype:session-log:session:${session}`
const VERSION = 1

const IndexSchema = z.strictObject({
  v: z.literal(VERSION),
  sessions: z.array(z.string().min(1)),
})
const SessionSchema = z.strictObject({
  v: z.literal(VERSION),
  events: z.array(SessionEventSchema),
})

function parser<T>(schema: z.ZodType<T>): (raw: string) => T | null {
  return (raw) => {
    try {
      const parsed = schema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }
}
const parseIndex = parser(IndexSchema)
const parseSession = parser(SessionSchema)

/** The index's sessions, `[]` for none (or one now moved aside), or null if the storage threw. */
function readIndex(storage: KeyedStorage): ReadonlyArray<string> | null {
  const opened = openRecord(
    storage,
    INDEX_KEY,
    parseIndex,
    `${INDEX_KEY}:unreadable:`
  )
  if (opened.kind === "unreadable") return null
  return opened.kind === "kept" ? opened.value.sessions : []
}

/** As `readIndex`, for one session's events. */
function readSession(
  storage: KeyedStorage,
  session: string
): SessionLog | null {
  const key = sessionKey(session)
  const opened = openRecord(storage, key, parseSession, `${key}:unreadable:`)
  if (opened.kind === "unreadable") return null
  return opened.kind === "kept" ? opened.value.events : []
}

/** Every kept session's events, in the order the sessions started, or null if the storage threw. */
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
 * Adds `event` to its session as kept now, and the session to the index;
 * the session's events after, or null when the device kept nothing new.
 */
export function appendStored(
  storage: KeyedStorage,
  event: SessionEvent
): SessionLog | null {
  const kept = readSession(storage, event.session)
  if (kept === null) return null
  const events = append(kept, event)
  if (
    events !== kept &&
    !writeRecord(
      storage,
      sessionKey(event.session),
      JSON.stringify({ v: VERSION, events }),
      parseSession
    )
  ) {
    return null
  }
  const sessions = readIndex(storage)
  if (sessions === null) return null
  if (sessions.includes(event.session)) return events
  const listed = writeRecord(
    storage,
    INDEX_KEY,
    JSON.stringify({ v: VERSION, sessions: [...sessions, event.session] }),
    parseIndex
  )
  return listed ? events : null
}
