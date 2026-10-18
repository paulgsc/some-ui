/**
 * The Jobs record as kept on the phone: one `localStorage` key. It is my own
 * record and the phone may hold its only copy, so nothing here writes over
 * what it could not read (as `packages/ui/aph/src/lib/stored.ts`):
 *
 * - a value that does not parse, or is another version, is moved aside to a
 *   key of its own (`QUARANTINE_PREFIX`) before the record starts again
 *   empty, and stays there;
 * - when even that is impossible (the storage throws), the record opens
 *   read-only and refuses every change.
 */
import {
  DigestSchema,
  FRICTION,
  OUTCOMES,
  PASS_REASONS,
} from "@some-ui/job-desk"
import { z } from "zod"

import type { StorageAdapter } from "@/lib/tenant/storage"

import type { JobEvent, JobsState } from "./model"

export const STORAGE_KEY = "some-ui:jobs"
/** Followed by 1, 2 …: an unreadable value, kept as it was found. */
export const QUARANTINE_PREFIX = "some-ui:jobs:unreadable:"
const VERSION = 1

const Stamp = { id: z.string(), at: z.string() }
const PickRef = { day: z.string(), pickId: z.string(), fingerprint: z.string() }
const Ids = z.array(z.string())

const EventSchema: z.ZodType<JobEvent> = z.discriminatedUnion("type", [
  z.object({ ...Stamp, ...PickRef, type: z.literal("taken") }),
  z.object({
    ...Stamp,
    ...PickRef,
    type: z.literal("passed"),
    reasons: z.array(z.enum(PASS_REASONS)),
    note: z.string(),
    voice: Ids,
  }),
  z.object({ ...Stamp, ...PickRef, type: z.literal("resume-ready") }),
  z.object({ ...Stamp, ...PickRef, type: z.literal("apply-opened") }),
  z.object({
    ...Stamp,
    ...PickRef,
    type: z.literal("debrief"),
    minutes: z.number(),
    friction: z.number(),
    chips: z.array(z.enum(FRICTION)),
    what: z.string(),
    voice: Ids,
    result: z.enum(["submitted", "gave-up", "closed"]),
  }),
  z.object({
    ...Stamp,
    type: z.literal("outcome"),
    fingerprint: z.string(),
    event: z.enum(OUTCOMES),
    on: z.string(),
    note: z.string(),
  }),
  z.object({
    ...Stamp,
    type: z.literal("disagree"),
    day: z.string(),
    fingerprint: z.string(),
    note: z.string(),
  }),
  z.object({
    ...Stamp,
    type: z.literal("scout"),
    scout: z
      .object({
        id: z.string(),
        url: z.string(),
        title: z.string(),
        why: z.string(),
        postingText: z.string().nullable(),
      })
      .and(
        z.discriminatedUnion("track", [
          z.object({ track: z.literal("software"), family: z.null() }),
          z.object({
            track: z.literal("adjacent"),
            family: z.enum(["data", "qa", "solutions"]),
          }),
        ])
      ),
    voice: Ids,
  }),
  z.object({
    ...Stamp,
    type: z.literal("shared"),
    kind: z.enum(["decisions", "scouts"]),
    day: z.string(),
    file: z.string(),
    through: z.number(),
    voice: Ids,
  }),
  z.object({ ...Stamp, type: z.literal("arrived"), shareId: z.string() }),
])

const StoredSchema = z.object({
  v: z.literal(VERSION),
  digests: z.array(DigestSchema),
  current: z.string().nullable(),
  log: z.array(EventSchema),
  voice: z.array(
    z.object({
      id: z.string(),
      mimeType: z.string(),
      durationMs: z.number(),
      owner: z.string(),
    })
  ),
})

/**
 * What opening the storage found: a record (`kept`, or `empty` when there
 * was none or an unreadable one was moved aside), or `unreadable` when the
 * storage itself threw and nothing may be written.
 */
export type Opened =
  | { kind: "kept"; state: JobsState }
  | { kind: "empty" }
  | { kind: "unreadable" }

function parse(raw: string): JobsState | null {
  try {
    const stored = StoredSchema.safeParse(JSON.parse(raw))
    if (!stored.success) return null
    const { digests, current, log, voice } = stored.data
    return { digests, current, log, voice }
  } catch {
    return null
  }
}

function quarantine(storage: StorageAdapter, raw: string): boolean {
  try {
    let n = 1
    while (storage.getItem(`${QUARANTINE_PREFIX}${n}`) !== null) n += 1
    storage.setItem(`${QUARANTINE_PREFIX}${n}`, raw)
    return true
  } catch {
    return false
  }
}

export function openStored(storage: StorageAdapter): Opened {
  let raw: string | null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return { kind: "unreadable" }
  }
  if (raw === null) return { kind: "empty" }
  const state = parse(raw)
  if (state !== null) return { kind: "kept", state }
  return quarantine(storage, raw) ? { kind: "empty" } : { kind: "unreadable" }
}

/** Whether the phone kept `state`; false leaves the old value as it was. */
export function writeStored(
  storage: StorageAdapter,
  state: JobsState
): boolean {
  try {
    const value = JSON.stringify({ v: VERSION, ...state })
    if (parse(value) === null) return false
    storage.setItem(STORAGE_KEY, value)
    return true
  } catch {
    return false
  }
}
