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
import { openRecord, writeRecord } from "@some-ui/core-utils"
import {
  DEBRIEF_RESULTS,
  DebriefMinutesSchema,
  DigestSchema,
  FRICTION,
  FrictionSchema,
  MAX_POSTING_TEXT,
  OUTCOMES,
  PASS_REASONS,
  TrackedSchema,
} from "@some-ui/job-desk"
import { z } from "zod"

import type { StorageAdapter } from "@/lib/tenant/storage"

import type { JobEvent, JobsState } from "./model"

export const STORAGE_KEY = "some-ui:jobs"
/** Followed by 1, 2 …: an unreadable value, kept as it was found. */
const QUARANTINE_PREFIX = "some-ui:jobs:unreadable:"
const VERSION = 1

const Stamp = { id: z.string(), at: z.string() }
const PickRef = { day: z.string(), pickId: z.string(), fingerprint: z.string() }
const Ids = z.array(z.string())

export const EventSchema: z.ZodType<JobEvent> = z.discriminatedUnion("type", [
  z.object({ ...Stamp, ...PickRef, type: z.literal("taken") }),
  z.object({ ...Stamp, ...PickRef, type: z.literal("archived") }),
  z.object({
    ...Stamp,
    ...PickRef,
    type: z.literal("passed"),
    reasons: z.array(z.enum(PASS_REASONS)),
    note: z.string(),
    voice: Ids,
  }),
  z.object({
    ...Stamp,
    ...PickRef,
    type: z.literal("fit-note"),
    note: z.string(),
    voice: Ids,
  }),
  z.object({ ...Stamp, ...PickRef, type: z.literal("resume-ready") }),
  z.object({ ...Stamp, ...PickRef, type: z.literal("apply-opened") }),
  z.object({ ...Stamp, ...PickRef, type: z.literal("read") }),
  z.object({
    ...Stamp,
    ...PickRef,
    type: z.literal("debrief"),
    // A record kept before the one-tap ending holds numbers here.
    minutes: DebriefMinutesSchema.nullable(),
    friction: FrictionSchema.nullable(),
    chips: z.array(z.enum(FRICTION)),
    what: z.string(),
    voice: Ids,
    result: z.enum(DEBRIEF_RESULTS),
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
        postingText: z.string().max(MAX_POSTING_TEXT).nullable(),
      })
      .and(TrackedSchema),
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
  firstOpened: z.record(z.string(), z.string()),
  log: z.array(EventSchema),
  voice: z.array(
    z.object({
      id: z.string(),
      mimeType: z.string(),
      durationMs: z.number(),
      owner: z.string(),
    })
  ),
  // A record kept by the first Jobs build has no `home`: not yet kept there.
  home: z
    .object({
      kept: z.boolean(),
      held: Ids,
      refused: z.array(z.object({ id: z.string(), why: z.string() })),
      // A record kept before files went home has none.
      refusedFiles: z.array(z.string()).default([]),
    })
    .default({ kept: false, held: [], refused: [], refusedFiles: [] }),
  // A record kept before shares noted where they began has none.
  carried: z.record(z.string(), z.number()).default({}),
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
    const { digests, current, firstOpened, log, voice, home, carried } =
      stored.data
    return { digests, current, firstOpened, log, voice, home, carried }
  } catch {
    return null
  }
}

export function openStored(storage: StorageAdapter): Opened {
  const opened = openRecord(storage, STORAGE_KEY, parse, QUARANTINE_PREFIX)
  if (opened.kind === "kept") return { kind: "kept", state: opened.value }
  return opened.kind === "moved" ? { kind: "empty" } : opened
}

/** Whether the phone kept `state`; false leaves the old value as it was. */
export function writeStored(
  storage: StorageAdapter,
  state: JobsState
): boolean {
  try {
    const text = JSON.stringify({ v: VERSION, ...state })
    return writeRecord(storage, STORAGE_KEY, text, parse)
  } catch {
    return false
  }
}
