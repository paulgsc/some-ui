/**
 * The game bites kept on this phone (GW3, `@some-ui/game-week`), as one
 * record: every bite and what home is told of it. Pure; `./runtime` keeps
 * it in this device's storage and the audio on a shelf of its own.
 *
 * Append-only but for Undo: a bite is added once, and only a bite still
 * held back (`holdUntil` not yet reached) can be said again (`amended`) or
 * thrown away (`undone`). Once its hold has run out it is the voice lane's
 * to copy for home (`lib/home-link/voice-copy`), and nothing here lets it go.
 */
import { assertNever, isRecord } from "@some-ui/core-utils"
import type { KeptBite } from "@some-ui/game-week"

export type GameBitesEvent =
  | { readonly kind: "kept"; readonly bite: KeptBite }
  | {
      readonly kind: "amended"
      readonly id: string
      readonly fields: Readonly<Record<string, string>>
      readonly holdUntil: number
    }
  | { readonly kind: "released"; readonly id: string }
  | { readonly kind: "undone"; readonly id: string }

/** Why an event was refused: the bite is unknown, or no longer held back. */
export type Refusal = "unknown" | "on-its-way"

/** Whether `bite` may start on its way home at `now`. */
export function isReady(bite: KeptBite, now: number): boolean {
  return bite.holdUntil <= now
}

/**
 * The record after `event` at `now`, or why it was refused. Keeping a bite
 * already kept changes nothing.
 */
export function stepGameBites(
  bites: ReadonlyArray<KeptBite>,
  event: GameBitesEvent,
  now: number
): ReadonlyArray<KeptBite> | Refusal {
  if (event.kind === "kept") {
    return bites.some((b) => b.id === event.bite.id)
      ? bites
      : [...bites, event.bite]
  }
  const bite = bites.find((b) => b.id === event.id)
  if (bite === undefined) return "unknown"
  if (isReady(bite, now)) {
    // Releasing what is already on its way is no change, and no refusal.
    return event.kind === "released" ? bites : "on-its-way"
  }
  switch (event.kind) {
    case "amended": {
      return bites.map((b) =>
        b === bite
          ? { ...b, fields: event.fields, holdUntil: event.holdUntil }
          : b
      )
    }
    case "released": {
      return bites.map((b) => (b === bite ? { ...b, holdUntil: now } : b))
    }
    case "undone": {
      return bites.filter((b) => b !== bite)
    }
    default: {
      return assertNever(event)
    }
  }
}

const isString = (value: unknown): value is string => typeof value === "string"
const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

function isFields(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every(isString)
}

function isBite(value: unknown): value is KeptBite {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.gameId) &&
    isString(value.at) &&
    isString(value.contentType) &&
    isNumber(value.durationMs) &&
    isFields(value.fields) &&
    isNumber(value.holdUntil)
  )
}

/** The stored record, or null for one this build cannot read. */
export function parseGameBites(raw: string): ReadonlyArray<KeptBite> | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  return Array.isArray(value) && value.every(isBite) ? value : null
}
