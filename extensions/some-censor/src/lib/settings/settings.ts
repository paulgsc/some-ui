/**
 * The owner's settings (`QD16`, #1807): the boundary `B` and the on/off
 * switch, in `storage.local`.
 *
 * The popup is the only writer. The content script reads the record at start
 * and follows `storage.onChanged`; nothing goes through the background.
 * Anything unreadable parses to the default for that field, and every
 * default is the narrowest choice (on, one year), so a bad record never
 * admits more than a fresh install does.
 *
 * Every boundary change is appended to `boundaryChanges`, which only the
 * Diagnostics page reads: the doctrine's §9 falsifier is "`B` keeps getting
 * lowered", and that needs the history, kept whole.
 */

import { DEFAULT_BOUNDARY_DAYS } from "@censor/lib/content/maturity/maturity"

export const SETTINGS_KEY = "settings"
export const BOUNDARY_CHANGES_KEY = "boundaryChanges"

export const BOUNDARIES = ["6mo", "1y", "2y"] as const
export type Boundary = (typeof BOUNDARIES)[number]

export const BOUNDARY_LABEL: Readonly<Record<Boundary, string>> = {
  "6mo": "6 months",
  "1y": "1 year",
  "2y": "2 years",
}

/** Half a 365-day year, rounded up so the boundary errs late. */
const BOUNDARY_DAYS: Readonly<Record<Boundary, number>> = {
  "6mo": 183,
  "1y": DEFAULT_BOUNDARY_DAYS,
  "2y": 2 * DEFAULT_BOUNDARY_DAYS,
}

export function boundaryDays(b: Boundary): number {
  return BOUNDARY_DAYS[b]
}

export type Settings = {
  readonly boundary: Boundary
  readonly enabled: boolean
}

export const DEFAULT_SETTINGS: Settings = { boundary: "1y", enabled: true }

/** The stored shape. `v` changes when a field's meaning does. */
type StoredSettings = Settings & { readonly v: 1 }

export type BoundaryChange = {
  readonly at: number
  readonly from: Boundary
  readonly to: Boundary
}

function isBoundary(value: unknown): value is Boundary {
  return BOUNDARIES.some((b) => b === value)
}

/** A record from any build, or none, as settings this build can apply. */
export function parseSettings(raw: unknown): Settings {
  if (raw === null || typeof raw !== "object" || Reflect.get(raw, "v") !== 1)
    return DEFAULT_SETTINGS
  const boundary: unknown = Reflect.get(raw, "boundary")
  const enabled: unknown = Reflect.get(raw, "enabled")
  return {
    boundary: isBoundary(boundary) ? boundary : DEFAULT_SETTINGS.boundary,
    enabled: typeof enabled === "boolean" ? enabled : DEFAULT_SETTINGS.enabled,
  }
}

/** The well-formed entries of a stored change log, oldest first. */
export function parseBoundaryChanges(raw: unknown): Array<BoundaryChange> {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (e: unknown): e is BoundaryChange =>
      e !== null &&
      typeof e === "object" &&
      typeof Reflect.get(e, "at") === "number" &&
      isBoundary(Reflect.get(e, "from")) &&
      isBoundary(Reflect.get(e, "to"))
  )
}

/**
 * What to store when the owner picks `next`, given what is stored now. The
 * log is only ever appended to: entries this build cannot read, and a value
 * that is not a list at all, are carried along rather than dropped.
 */
export function settingsWrite(
  stored: Readonly<Record<string, unknown>>,
  next: Settings,
  now: number
): Record<string, unknown> {
  const settings: StoredSettings = { v: 1, ...next }
  const from = parseSettings(stored[SETTINGS_KEY]).boundary
  if (from === next.boundary) return { [SETTINGS_KEY]: settings }
  const change: BoundaryChange = { at: now, from, to: next.boundary }
  const log = stored[BOUNDARY_CHANGES_KEY]
  return {
    [SETTINGS_KEY]: settings,
    [BOUNDARY_CHANGES_KEY]: Array.isArray(log)
      ? [...log, change]
      : log === undefined
        ? [change]
        : [log, change],
  }
}
