/**
 * The owner's settings (`QD16`, #1807, #1966): the boundary `B`, the mode,
 * what autoplay does at a held video, and the on/off switch, in
 * `storage.local`.
 *
 * The popup is the only writer; the popup and the content script both read
 * through {@link followSettings}. An unreadable field parses to its default,
 * so a bad record never admits more than a fresh install does.
 *
 * Every boundary change is appended to `boundaryChanges`, which only the
 * Diagnostics page reads, and every change of mode or autoplay to
 * `choiceChanges`, kept for it too: the doctrine's §9 falsifier is "`B`
 * keeps getting lowered", and that needs the history, kept whole.
 */

import type { AutoplayRule } from "@censor/lib/content/core/state"
import { DEFAULT_BOUNDARY_DAYS } from "@censor/lib/content/maturity/maturity"
import { isRecord } from "@some-extension/common"

export const SETTINGS_KEY = "settings"
export const BOUNDARY_CHANGES_KEY = "boundaryChanges"
export const CHOICE_CHANGES_KEY = "choiceChanges"

export const BOUNDARIES = ["6mo", "1y", "2y"] as const
export type Boundary = (typeof BOUNDARIES)[number]

export const BOUNDARY_LABEL: Readonly<Record<Boundary, string>> = {
  "6mo": "6 months",
  "1y": "1 year",
  "2y": "2 years",
}

/**
 * Half of `DEFAULT_BOUNDARY_DAYS`, rounded down: the estimator reads
 * "1 year ago" as 182 days, so a longer 6 months would hold it while
 * plating "8 months ago".
 */
const BOUNDARY_DAYS: Readonly<Record<Boundary, number>> = {
  "6mo": 182,
  "1y": DEFAULT_BOUNDARY_DAYS,
  "2y": 2 * DEFAULT_BOUNDARY_DAYS,
}

export function boundaryDays(b: Boundary): number {
  return BOUNDARY_DAYS[b]
}

/** Fixed bundles of the rest, strictest first (`modes.ts`). */
export const MODES = ["strict", "standard", "open"] as const
export type Mode = (typeof MODES)[number]

/** What autoplay does when its next video is held. */
const AUTOPLAYS = ["stop", "skip"] as const satisfies ReadonlyArray<Autoplay>
type Autoplay = AutoplayRule

export type Settings = {
  readonly boundary: Boundary
  readonly mode: Mode
  readonly autoplay: Autoplay
  readonly enabled: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  boundary: "1y",
  mode: "standard",
  autoplay: "stop",
  enabled: true,
}

/** The stored shape. `v` changes when a field's meaning does. */
type StoredSettings = Settings & { readonly v: 1 }

export type BoundaryChange = {
  readonly at: number
  readonly from: Boundary
  readonly to: Boundary
}

/** A change of mode or autoplay, as `choiceChanges` keeps it. */
export type ChoiceChange =
  | {
      readonly at: number
      readonly choice: "mode"
      readonly from: Mode
      readonly to: Mode
    }
  | {
      readonly at: number
      readonly choice: "autoplay"
      readonly from: Autoplay
      readonly to: Autoplay
    }

const oneOf =
  <T extends string>(values: ReadonlyArray<T>) =>
  (value: unknown): value is T =>
    values.some((v) => v === value)

const isBoundary = oneOf(BOUNDARIES)
const isMode = oneOf(MODES)
const isAutoplay = oneOf(AUTOPLAYS)

/** A record from any build, or none, as settings this build can apply. */
export function parseSettings(raw: unknown): Settings {
  if (!isRecord(raw) || raw["v"] !== 1) return DEFAULT_SETTINGS
  const { boundary, mode, autoplay, enabled } = raw
  return {
    boundary: isBoundary(boundary) ? boundary : DEFAULT_SETTINGS.boundary,
    mode: isMode(mode) ? mode : DEFAULT_SETTINGS.mode,
    autoplay: isAutoplay(autoplay) ? autoplay : DEFAULT_SETTINGS.autoplay,
    enabled: typeof enabled === "boolean" ? enabled : DEFAULT_SETTINGS.enabled,
  }
}

/** The well-formed entries of a stored change log, oldest first. */
export function parseBoundaryChanges(raw: unknown): Array<BoundaryChange> {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (e: unknown): e is BoundaryChange =>
      isRecord(e) &&
      typeof e["at"] === "number" &&
      isBoundary(e["from"]) &&
      isBoundary(e["to"])
  )
}

/** The well-formed entries of the mode and autoplay log, oldest first. */
export function parseChoiceChanges(raw: unknown): Array<ChoiceChange> {
  if (!Array.isArray(raw)) return []
  return raw.filter((e: unknown): e is ChoiceChange => {
    if (!isRecord(e) || typeof e["at"] !== "number") return false
    const { choice, from, to } = e
    if (choice === "mode") return isMode(from) && isMode(to)
    return choice === "autoplay" && isAutoplay(from) && isAutoplay(to)
  })
}

/**
 * `log` with `entries` appended: a log is only ever appended to. Entries this
 * build cannot read, and a value that is not a list at all, are carried
 * along rather than dropped.
 */
function appended(
  log: unknown,
  entries: ReadonlyArray<unknown>
): ReadonlyArray<unknown> {
  if (Array.isArray(log)) return [...log, ...entries]
  return log === undefined ? entries : [log, ...entries]
}

/**
 * What to store when the owner picks `next`, given what is stored now. Each
 * log gains an entry only when its own choice changed.
 */
export function settingsWrite(
  stored: Readonly<Record<string, unknown>>,
  next: Settings,
  now: number
): Record<string, unknown> {
  const settings: StoredSettings = { v: 1, ...next }
  const from = parseSettings(stored[SETTINGS_KEY])
  const write: Record<string, unknown> = { [SETTINGS_KEY]: settings }
  if (from.boundary !== next.boundary) {
    const change: BoundaryChange = {
      at: now,
      from: from.boundary,
      to: next.boundary,
    }
    write[BOUNDARY_CHANGES_KEY] = appended(stored[BOUNDARY_CHANGES_KEY], [
      change,
    ])
  }
  const choices: Array<ChoiceChange> = []
  if (from.mode !== next.mode) {
    choices.push({ at: now, choice: "mode", from: from.mode, to: next.mode })
  }
  if (from.autoplay !== next.autoplay) {
    choices.push({
      at: now,
      choice: "autoplay",
      from: from.autoplay,
      to: next.autoplay,
    })
  }
  if (choices.length > 0) {
    write[CHOICE_CHANGES_KEY] = appended(stored[CHOICE_CHANGES_KEY], choices)
  }
  return write
}

/** The slice of `browser.storage` the settings are read through. */
type SettingsStorage = {
  readonly local: { get(key: string): Promise<Record<string, unknown>> }
  readonly onChanged: {
    addListener(
      listener: (
        changes: Record<string, { newValue?: unknown }>,
        area: string
      ) => void
    ): void
  }
}

/**
 * Hand `apply` the stored settings, then every change. A change that lands
 * before the first read resolves is newer than it, so that read is dropped;
 * a failed read applies the defaults.
 */
export function followSettings(
  storage: SettingsStorage,
  apply: (settings: Settings) => void
): void {
  let changed = false
  // Lifetime: the calling document's own; unloading it ends the listener.
  storage.onChanged.addListener((changes, area) => {
    const change = changes[SETTINGS_KEY]
    if (area !== "local" || change === undefined) return
    changed = true
    apply(parseSettings(change.newValue))
  })
  void storage.local
    .get(SETTINGS_KEY)
    .then((stored) => parseSettings(stored[SETTINGS_KEY]))
    .catch(() => DEFAULT_SETTINGS)
    .then((settings) => {
      if (!changed) apply(settings)
    })
}
