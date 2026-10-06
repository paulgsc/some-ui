/**
 * A session stopped before its end, by "Got to go" or by leaving the app: one
 * record per stop, written the moment it happens and never asked for. Why it
 * stopped is optional, and can be given later from the player, the wrap or
 * Home. Read over many sessions, the records say what keeps cutting study
 * short.
 *
 * Kept on this device only, and bounded to the newest `STOP_LIMIT` stops.
 * Any failure (no storage, a full quota, a document this build cannot read)
 * reads as no stops and is never raised: a session works without them.
 */

export const REASONS = [
  ["break", "Break’s over"],
  ["person", "Someone needs me"],
  ["call", "Call or message"],
  ["move", "On the move"],
  ["focus", "Can’t focus"],
  ["other", "Something else"],
] as const

export type Reason = (typeof REASONS)[number][0]

export type Stop = {
  sessionId: string
  /** ISO time of the stop. With `sessionId`, it names the record. */
  stoppedAt: string
  elapsedMs: number
  plannedMs: number
  /** The scene playing at the stop: where "Pick up" restarts. */
  scene: string | null
  via: "tap" | "left"
  reason: Reason | null
  /** Where the reason was given: the stop, the return, the wrap, or Home. */
  reasonFrom: "stop" | "return" | "close" | "home" | null
  /** Open until picked up (resumed), called done, or left past the window. */
  outcome: "open" | "resumed" | "done" | "lapsed"
  settledAt: string | null
}

/** How long a stopped session can still be picked up. */
export const PICK_UP_MS = 30 * 60_000
/** Back within this after leaving the app: a glance, not a stop. */
export const GLANCE_MS = 60_000
export const STOP_LIMIT = 20

const STORAGE_KEY = "some-ui:session-stops"
const OUTCOMES: ReadonlyArray<string> = ["open", "resumed", "done", "lapsed"]

function isStop(value: unknown): value is Stop {
  if (typeof value !== "object" || value === null) return false
  const field = (key: keyof Stop): unknown => Reflect.get(value, key)
  const reason = field("reason")
  return (
    typeof field("sessionId") === "string" &&
    typeof field("stoppedAt") === "string" &&
    typeof field("elapsedMs") === "number" &&
    OUTCOMES.includes(String(field("outcome"))) &&
    (reason === null || REASONS.some(([id]) => id === reason))
  )
}

export function readStops(storage: Storage = localStorage): Array<Stop> {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? "[]")
    return Array.isArray(parsed) ? parsed.filter(isStop) : []
  } catch {
    return []
  }
}

function writeStops(stops: Array<Stop>, storage: Storage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(stops.slice(0, STOP_LIMIT)))
  } catch {
    // A full or missing store loses this stop, never the session.
  }
}

const same = (a: Stop, b: Stop): boolean =>
  a.sessionId === b.sessionId && a.stoppedAt === b.stoppedAt

/** The session's latest stop, newest first as stored. */
export function latestStop(
  sessionId: string,
  storage: Storage = localStorage
): Stop | null {
  return readStops(storage).find((s) => s.sessionId === sessionId) ?? null
}

/** Writes `stop` as new, or over the record it names. */
export function saveStop(stop: Stop, storage: Storage = localStorage): void {
  const rest = readStops(storage).filter((s) => !same(s, stop))
  writeStops([stop, ...rest], storage)
}

/** A mis-tap is not a stop, and neither is a glance away. */
export function forgetStop(stop: Stop, storage: Storage = localStorage): void {
  writeStops(
    readStops(storage).filter((s) => !same(s, stop)),
    storage
  )
}

/**
 * Merges `patch` into the stored record `stop` names, not into `stop`
 * itself: a reason picked elsewhere since `stop` was read survives.
 */
export function updateStop(
  stop: Stop,
  patch: Partial<Pick<Stop, "reason" | "reasonFrom" | "outcome" | "settledAt">>,
  storage: Storage = localStorage
): Stop {
  const stored = readStops(storage).find((s) => same(s, stop)) ?? stop
  const next = { ...stored, ...patch }
  saveStop(next, storage)
  return next
}

export function settle(
  stop: Stop,
  outcome: Exclude<Stop["outcome"], "open">,
  now: Date = new Date()
): Stop {
  return updateStop(stop, { outcome, settledAt: now.toISOString() })
}

export function msSinceStop(stop: Stop, now: Date): number {
  return now.getTime() - new Date(stop.stoppedAt).getTime()
}

/** Open and past the window: closed as it stood, counted, not resumable. */
export function hasLapsed(stop: Stop, now: Date): boolean {
  return stop.outcome === "open" && msSinceStop(stop, now) > PICK_UP_MS
}
