import { assertNever } from "@some-ui/core-utils"

import { boundedList } from "@/lib/bounded-list"
import type { SessionRecord } from "@/lib/tenant"
import { finishedNaturally } from "@/lib/wind-down"

/**
 * A session stopped before its end, by "Got to go" or by leaving the app:
 * one record per stop, kept the moment it happens, its reason optional. The
 * newest `STOP_LIMIT` stay on this device (`apps/mobile/README.md`, "A
 * session cut short still closes").
 *
 * `step` is the whole policy: what a tap, leaving, coming back and the clock
 * mean for a stop. `./runtime` runs its effects; React only forwards events.
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

const OUTCOMES = ["open", "resumed", "done", "lapsed"] as const

export type Stop = {
  sessionId: string
  /** ISO. With `sessionId`, it names the record. */
  stoppedAt: string
  elapsedMs: number
  plannedMs: number
  /** Where a pick-up restarts once the activity has remounted. */
  scene: string | null
  via: "tap" | "left"
  reason: Reason | null
  reasonFrom: "stop" | "return" | "close" | "home" | null
  outcome: (typeof OUTCOMES)[number]
  /** When it stopped being open: how long the person was away. */
  settledAt: string | null
}

export const PICK_UP_MS = 30 * 60_000
/** Back within this after leaving the app: a glance, not a stop. */
export const GLANCE_MS = 60_000
const STOP_LIMIT = 20

const store = boundedList(
  "some-ui:session-stops",
  STOP_LIMIT,
  (value): value is Stop => {
    if (typeof value !== "object" || value === null) return false
    const field = (key: keyof Stop): unknown => Reflect.get(value, key)
    const reason = field("reason")
    return (
      typeof field("sessionId") === "string" &&
      typeof field("stoppedAt") === "string" &&
      typeof field("elapsedMs") === "number" &&
      OUTCOMES.some((o) => o === field("outcome")) &&
      (reason === null || REASONS.some(([id]) => id === reason))
    )
  }
)

const same =
  (a: Stop) =>
  (b: Stop): boolean =>
    a.sessionId === b.sessionId && a.stoppedAt === b.stoppedAt

export function latestStop(sessionId: string): Stop | null {
  return store.read().find((s) => s.sessionId === sessionId) ?? null
}

/**
 * Merges `patch` into the stored record `stop` names, not into `stop`
 * itself: a reason picked elsewhere since `stop` was read survives.
 */
export function updateStop(
  stop: Stop,
  patch: Partial<Pick<Stop, "reason" | "reasonFrom" | "outcome" | "settledAt">>
): Stop {
  const next = { ...(store.read().find(same(stop)) ?? stop), ...patch }
  store.put(next, same(next))
  return next
}

export function msSinceStop(stop: Stop, now: Date): number {
  return now.getTime() - new Date(stop.stoppedAt).getTime()
}

/** Ended at its stop, not at its end: what the wrap and Home call cut short. */
export function cutShortStop(
  session: Pick<SessionRecord, "id" | "totalDurationMs" | "finalElapsedMs">
): Stop | null {
  const stop = latestStop(session.id)
  const elapsed = session.finalElapsedMs ?? session.totalDurationMs
  return (stop?.outcome === "done" || stop?.outcome === "lapsed") &&
    !finishedNaturally(elapsed, session.totalDurationMs)
    ? stop
    : null
}

/**
 * The stop an unfinished session should close at, settling it as lapsed if
 * its window has passed. A stop already settled as closed is returned too:
 * the write that should have completed its session failed, so it is retried.
 */
export function closingStop(sessionId: string, now: Date): Stop | null {
  const stop = latestStop(sessionId)
  if (stop?.outcome === "open" && msSinceStop(stop, now) > PICK_UP_MS) {
    return updateStop(stop, { outcome: "lapsed", settledAt: now.toISOString() })
  }
  return stop?.outcome === "done" || stop?.outcome === "lapsed" ? stop : null
}

/** The session write that closes it where `stop` left it. */
export function closedPatch(
  stop: Stop
): Pick<SessionRecord, "status" | "completedAt" | "finalElapsedMs"> {
  return {
    status: "completed",
    // Lapsed counts on the day it stopped, not the day it was noticed.
    completedAt:
      stop.outcome === "lapsed"
        ? stop.stoppedAt
        : (stop.settledAt ?? stop.stoppedAt),
    finalElapsedMs: stop.elapsedMs,
  }
}

// The machine: one player mount's stop.

export type StopState =
  | { kind: "none" }
  /** `live`: playback is paused in place; otherwise it remounted. */
  | { kind: "open"; stop: Stop; returning: boolean; live: boolean }
  | { kind: "closed"; stop: Stop }

export type StopEvent =
  | { type: "begin"; latest: Stop | null; now: Date }
  /** `stop`: what playback would stop at, null when nothing is playing. */
  | { type: "tap" | "hidden"; stop: Stop | null }
  | { type: "visible" | "tick" | "pickUp" | "done"; now: Date }

export type StopEffect =
  | { kind: "save" | "forget"; stop: Stop }
  | { kind: "settle"; stop: Stop; outcome: Stop["outcome"]; at: string }
  | { kind: "pause" | "resume" | "start" | "end" }
  | { kind: "restart"; scene: string | null }

const NONE: StopState = { kind: "none" }

function close(
  stop: Stop,
  outcome: "done" | "lapsed",
  now: Date
): [StopState, Array<StopEffect>] {
  const at = now.toISOString()
  return [
    { kind: "closed", stop: { ...stop, outcome, settledAt: at } },
    [{ kind: "settle", stop, outcome, at }, { kind: "end" }],
  ]
}

export function step(
  state: StopState,
  event: StopEvent
): [StopState, Array<StopEffect>] {
  switch (event.type) {
    case "begin": {
      const stop = event.latest
      if (stop?.outcome === "done" || stop?.outcome === "lapsed") {
        return [{ kind: "closed", stop }, [{ kind: "end" }]]
      }
      if (stop?.outcome !== "open") return [NONE, [{ kind: "start" }]]
      if (msSinceStop(stop, event.now) > PICK_UP_MS) {
        return close(stop, "lapsed", event.now)
      }
      return [{ kind: "open", stop, returning: true, live: false }, []]
    }
    case "tap":
    case "hidden": {
      const returning = event.type === "hidden"
      if (state.kind === "open") return [{ ...state, returning }, []]
      if (state.kind === "closed" || event.stop === null) return [state, []]
      const via: Stop["via"] = returning ? "left" : "tap"
      const stop: Stop = { ...event.stop, via }
      return [
        { kind: "open", stop, returning, live: true },
        [{ kind: "pause" }, { kind: "save", stop }],
      ]
    }
    case "visible":
    case "tick":
    case "pickUp":
    case "done": {
      if (state.kind !== "open") return [state, []]
      const { stop } = state
      const away = msSinceStop(stop, event.now)
      if (away > PICK_UP_MS) return close(stop, "lapsed", event.now)
      if (event.type === "done") return close(stop, "done", event.now)
      const keepGoing = event.type === "pickUp" && !state.returning
      const glance =
        event.type === "visible" && stop.via === "left" && away < GLANCE_MS
      if (keepGoing || glance) {
        return [NONE, [{ kind: "forget", stop }, { kind: "resume" }]]
      }
      if (event.type !== "pickUp") return [state, []]
      const at = event.now.toISOString()
      return [
        NONE,
        [
          { kind: "settle", stop, outcome: "resumed", at },
          state.live
            ? { kind: "resume" }
            : { kind: "restart", scene: stop.scene },
        ],
      ]
    }
    default: {
      return assertNever(event)
    }
  }
}

/** Runs a "save", "settle" or "forget" against the stored records. */
export function storeEffect(effect: StopEffect): void {
  if (effect.kind === "save") store.put(effect.stop, same(effect.stop))
  if (effect.kind === "forget") store.remove(same(effect.stop))
  if (effect.kind === "settle") {
    updateStop(effect.stop, { outcome: effect.outcome, settledAt: effect.at })
  }
}
