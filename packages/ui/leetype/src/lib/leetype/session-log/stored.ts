/**
 * The session log as kept on the device: one `localStorage` key, under the
 * same rules as `apps/www/src/lib/jobs/stored.ts`, since it is the owner's
 * record and the device may hold its only copy:
 *
 * - a value that does not parse, or is another version, is moved aside to a
 *   key of its own (`QUARANTINE_PREFIX`) before the log starts again empty,
 *   and stays there;
 * - when even that is impossible (the storage throws), the log opens
 *   read-only and refuses every append.
 *
 * On the Pages build `localStorage` is the viewer's in-memory copy
 * (`apps/www/src/lib/demo/viewer-storage.ts`), so nothing is kept there.
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import { openRecord, writeRecord } from "@some-ui/core-utils"
import { z } from "zod"

import type { SessionEvent, SessionLog } from "./model"

export const STORAGE_KEY = "leetype:session-log"
/** Followed by 1, 2 …: an unreadable value, kept as it was found. */
const QUARANTINE_PREFIX = "leetype:session-log:unreadable:"
const VERSION = 1

const Stamp = { id: z.string().min(1), at: z.string(), session: z.string() }
const ResponseSchema = z.enum(["correct", "incorrect", "abstained"])

const EventSchema: z.ZodType<SessionEvent> = z.discriminatedUnion("type", [
  z.object({
    ...Stamp,
    type: z.literal("started"),
    file: z.string(),
    form: z.enum(["full", "short"]),
    declaredMinutes: z.number().positive(),
  }),
  z.object({
    ...Stamp,
    type: z.literal("picked"),
    screen: z.string(),
    option: z.string(),
    response: ResponseSchema,
    ms: z.number().nonnegative(),
    slow: z.boolean(),
  }),
  z.object({
    ...Stamp,
    type: z.literal("placed"),
    screen: z.string(),
    reading: z.string(),
  }),
  z.object({
    ...Stamp,
    type: z.literal("reading"),
    reading: z.string(),
    action: z.enum(["opened", "saved", "read", "skipped"]),
  }),
  z.object({ ...Stamp, type: z.literal("parked"), screen: z.string() }),
  z.object({
    ...Stamp,
    type: z.literal("confirmation-taken"),
    screen: z.string(),
  }),
  z.object({
    ...Stamp,
    type: z.literal("returned"),
    screen: z.string(),
    variant: z.string(),
    response: ResponseSchema,
  }),
  z.object({
    ...Stamp,
    type: z.literal("spoken"),
    screen: z.string(),
    seconds: z.number().nonnegative(),
    passed: z.boolean(),
    typed: z.boolean(),
    ticks: z.array(z.string()),
  }),
  z.object({
    ...Stamp,
    type: z.literal("ended"),
    screen: z.string(),
    how: z.enum(["declared", "left"]),
  }),
])

const StoredSchema = z.object({
  v: z.literal(VERSION),
  log: z.array(EventSchema),
})

function parse(raw: string): SessionLog | null {
  try {
    const stored = StoredSchema.safeParse(JSON.parse(raw))
    return stored.success ? stored.data.log : null
  } catch {
    return null
  }
}

/**
 * What opening the storage found: the log (`kept`, or `empty` when there was
 * none or an unreadable one was moved aside), or `unreadable` when the
 * storage itself threw and nothing may be written.
 */
export type Opened =
  | { kind: "kept"; log: SessionLog }
  | { kind: "empty" }
  | { kind: "unreadable" }

export function openStored(storage: KeyedStorage): Opened {
  const opened = openRecord(storage, STORAGE_KEY, parse, QUARANTINE_PREFIX)
  if (opened.kind === "kept") return { kind: "kept", log: opened.value }
  return opened.kind === "moved" ? { kind: "empty" } : opened
}

/** Whether the device kept `log`; false leaves the old value as it was. */
export function writeStored(storage: KeyedStorage, log: SessionLog): boolean {
  return writeRecord(
    storage,
    STORAGE_KEY,
    JSON.stringify({ v: VERSION, log }),
    parse
  )
}
