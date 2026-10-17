/**
 * aph's state as kept on the device: one `localStorage` key, under the APK's
 * pinned `https://localhost` origin (`apps/mobile/capacitor.config.ts`), so
 * it outlives a reload, a restart and an update installed over the app, and
 * goes into Android's backup with the rest of the WebView's storage.
 *
 * What is kept is my own record and has no other copy, so nothing here ever
 * writes over something it could not read:
 *
 * - a value that does not parse, is another version, or breaks a rule in
 *   `violations` is moved aside to a key of its own (`QUARANTINE_PREFIX`)
 *   before the store starts again from its fallback, and stays there;
 * - when even that is impossible (the storage throws), the store is opened
 *   read-only: it shows the fallback and refuses every change, rather than
 *   save over the record it failed to read.
 *
 * Once kept on home (`home.ts`), the phone keeps a `HomeRecord` under
 * `HOME_KEY` instead: the settings and what home has not confirmed, held to
 * the same rules. The device record is removed only after the home record
 * that carries all of it is written, and a phone holding both opens the home
 * one.
 */
import { localStorageOrNull } from "@some-ui/core-utils"
import { z } from "zod"

import type { HomeHeld, HomeRecord } from "./home"
import type { AphSettings, Entry } from "./model"
import { violations } from "./model"
import type { AphState } from "./store"

/** The part of `Storage` this touches, so tests can pass a fake. */
export type AphStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

export const STORAGE_KEY = "aph:state"
/** Followed by 1, 2 …: an unreadable value, kept as it was found. */
export const QUARANTINE_PREFIX = "aph:state:unreadable:"
const VERSION = 1

/** The home record, once aph is kept on home. */
export const HOME_KEY = "aph:home"
/** Followed by 1, 2 …: an unreadable home record, kept as it was found. */
export const HOME_QUARANTINE_PREFIX = "aph:home:unreadable:"
const HOME_VERSION = 1

const CheckpointSchema = z.object({
  id: z.string(),
  label: z.string(),
  minutes: z.number(),
  goal: z.number(),
})

export const SettingsSchema: z.ZodType<AphSettings> = z.object({
  checkpoints: z.array(CheckpointSchema),
  labels: z.array(z.string()),
  step: z.number(),
  usualLow: z.number(),
  usualHigh: z.number(),
  tolerance: z.number(),
  since: z.string(),
})

export const EntrySchema: z.ZodType<Entry> = z.object({
  id: z.string(),
  day: z.string(),
  checkpoint: z.string().nullable(),
  time: z.string().nullable(),
  mine: z.object({ value: z.number(), approx: z.boolean() }).nullable(),
  theirs: z.object({ value: z.number() }).nullable(),
  goal: z.number().nullable(),
  labels: z.array(z.string()),
  note: z.string().nullable(),
  review: z.enum(["agreed", "flagged"]).nullable(),
})

const StoredSchema = z.object({
  v: z.literal(VERSION),
  settings: SettingsSchema,
  entries: z.array(EntrySchema),
})

const HomeSchema = z.object({
  v: z.literal(HOME_VERSION),
  settings: SettingsSchema,
  settingsPending: z.boolean(),
  pending: z.array(EntrySchema),
  refused: z.array(z.object({ id: z.string(), why: z.string() })),
})

/**
 * What opening the storage found:
 *
 * - `kept`: a readable state;
 * - `empty`: nothing yet, or an unreadable value now moved aside;
 * - `unreadable`: the storage itself threw, so nothing may be written.
 */
export type Opened =
  | { kind: "kept"; state: AphState }
  | { kind: "empty" }
  | { kind: "unreadable" }

function parse(raw: string): AphState | null {
  try {
    const stored = StoredSchema.safeParse(JSON.parse(raw))
    if (!stored.success) return null
    const { settings, entries } = stored.data
    return violations(settings, entries).length === 0
      ? { settings, entries }
      : null
  } catch {
    return null
  }
}

/** Moves `raw` to the first free quarantine key; false if it could not. */
function quarantine(
  storage: AphStorage,
  raw: string,
  prefix = QUARANTINE_PREFIX
): boolean {
  try {
    let n = 1
    while (storage.getItem(`${prefix}${n}`) !== null) n += 1
    storage.setItem(`${prefix}${n}`, raw)
    return true
  } catch {
    return false
  }
}

/** Stands in for a `localStorage` the page has but cannot touch. */
const BLOCKED: AphStorage = {
  getItem: () => {
    throw new Error("localStorage is blocked")
  },
  setItem: () => {
    throw new Error("localStorage is blocked")
  },
  removeItem: () => {
    throw new Error("localStorage is blocked")
  },
}

/**
 * The device's storage: null only where there is no window at all (Node, a
 * prerender), which is memory only by design. A window whose `localStorage`
 * throws is storage that cannot be read, so the store opens read-only on it
 * rather than pretend to keep what a restart would lose.
 */
export function deviceStorage(): AphStorage | null {
  if (typeof window === "undefined") return null
  return localStorageOrNull() ?? BLOCKED
}

export function openStored(storage: AphStorage): Opened {
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

/**
 * Writes `state`; false when the storage refused it (full, or disabled), or
 * when the next launch could not read it back (a figure JSON cannot hold,
 * such as `Infinity`), which would quarantine the whole record.
 */
export function writeStored(storage: AphStorage, state: AphState): boolean {
  const text = JSON.stringify({ v: VERSION, ...state })
  if (parse(text) === null) return false
  try {
    storage.setItem(STORAGE_KEY, text)
    return true
  } catch {
    return false
  }
}

/**
 * What opening the home record found, as `Opened` for the device record:
 * `moved` is an unreadable record now moved aside, which the store starts
 * again from home's own copy rather than from the paper notes.
 */
export type OpenedHome =
  | { kind: "kept"; record: HomeRecord }
  | { kind: "empty" }
  | { kind: "moved" }
  | { kind: "unreadable" }

function parseHome(raw: string): HomeRecord | null {
  try {
    const stored = HomeSchema.safeParse(JSON.parse(raw))
    if (!stored.success) return null
    const { settings, settingsPending, pending, refused } = stored.data
    return violations(settings, pending).length === 0
      ? { settings, settingsPending, pending, refused }
      : null
  } catch {
    return null
  }
}

export function openHome(storage: AphStorage): OpenedHome {
  let raw: string | null
  try {
    raw = storage.getItem(HOME_KEY)
  } catch {
    return { kind: "unreadable" }
  }
  if (raw === null) return { kind: "empty" }
  const record = parseHome(raw)
  if (record !== null) return { kind: "kept", record }
  return quarantine(storage, raw, HOME_QUARANTINE_PREFIX)
    ? { kind: "moved" }
    : { kind: "unreadable" }
}

/** Writes `record`; false when the storage refused it or could not read it back. */
export function writeHome(storage: AphStorage, record: HomeRecord): boolean {
  const text = JSON.stringify({ v: HOME_VERSION, ...record })
  if (parseHome(text) === null) return false
  try {
    storage.setItem(HOME_KEY, text)
    return true
  } catch {
    return false
  }
}

/**
 * Removes the device record, once a home record carrying all of it is kept.
 * False when the storage would not; the home record still wins on opening.
 */
export function forgetDeviceRecord(storage: AphStorage): boolean {
  try {
    storage.removeItem(STORAGE_KEY)
    return true
  } catch {
    return false
  }
}

/** Home's `GET /aph` answer. */
export const HeldSchema: z.ZodType<HomeHeld> = z.object({
  settings: SettingsSchema.nullable(),
  entries: z.array(EntrySchema),
})
