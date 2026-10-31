import { assertNever } from "@some-ui/core-utils"

import { boundedList } from "@/lib/bounded-list"
import type { SessionRecord } from "@/lib/tenant"
import { finishedNaturally } from "@/lib/wind-down"

/**
 * A session stopped before its end, by "Got to go" or by leaving it (the app
 * hidden, or Back or a link taking its screen away): one record per stop,
 * kept the moment it happens, its reason optional. The newest `STOP_LIMIT`
 * stay on this device (`apps/mobile/README.md`, "A session cut short still
 * closes"), beside each session's `PathCounts`.
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
  /** For the record (both shares in `lib/agent-export`); a pick-up seeks to `elapsedMs`. */
  scene: string | null
  /** "left": the app went to the background, or the player's screen closed. */
  via: "tap" | "left"
  reason: Reason | null
  reasonFrom: "stop" | "return" | "close" | "home" | null
  outcome: (typeof OUTCOMES)[number]
  /** When it stopped being open: how long the person was away. */
  settledAt: string | null
}

export const PICK_UP_MS = 30 * 60_000
/** Back within this after leaving: a glance, not a stop. */
export const GLANCE_MS = 60_000
/** Stops kept, and sessions whose paths are counted: the oldest goes past it. */
export const STOP_LIMIT = 20

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

/**
 * How often a session took each path that leaves no stop of its own, or
 * whose stop may since have been dropped. Counted as the machine takes it,
 * for the export; nothing in the app reads them back.
 */
export type PathCounts = {
  sessionId: string
  /** The player opened on it unfinished, the first time included. */
  opens: number
  /** Back within `GLANCE_MS` of leaving: the stop was forgotten. */
  glances: number
  /** "Oops, keep going" just after "Got to go": the stop was forgotten. */
  takenBack: number
  /** Picked up after a stop, which then reads "resumed" while it is kept. */
  pickUps: number
}

type Path = keyof Omit<PathCounts, "sessionId">

const PATHS = [
  "opens",
  "glances",
  "takenBack",
  "pickUps",
] as const satisfies ReadonlyArray<Path>

const paths = boundedList(
  "some-ui:session-paths",
  STOP_LIMIT,
  (value): value is PathCounts =>
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "sessionId") === "string" &&
    PATHS.every((path) => typeof Reflect.get(value, path) === "number")
)

/** Each counted session's paths, most recently counted first. */
export function allPathCounts(): Array<PathCounts> {
  return paths.read()
}

export function pathCounts(sessionId: string): PathCounts | null {
  return paths.read().find((p) => p.sessionId === sessionId) ?? null
}

const same =
  (a: Stop) =>
  (b: Stop): boolean =>
    a.sessionId === b.sessionId && a.stoppedAt === b.stoppedAt

/** Every kept stop, newest first. */
export function allStops(): Array<Stop> {
  return store.read()
}

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

/**
 * Ended at its stop, not at its end: what the wrap and Home call cut short.
 * Measured against the plan at the stop, which includes any "+5 min".
 */
export function cutShortStop(sessionId: string): Stop | null {
  const stop = latestStop(sessionId)
  return (stop?.outcome === "done" || stop?.outcome === "lapsed") &&
    !finishedNaturally(stop.elapsedMs, stop.plannedMs)
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

/** What the stop left behind: playback paused by it, already paused, or gone. */
type Playback = "playing" | "paused" | "remounted"

export type StopState =
  | { kind: "none" }
  | { kind: "open"; stop: Stop; returning: boolean; playback: Playback }
  | { kind: "closed"; stop: Stop }

export type StopEvent =
  | { type: "begin"; sessionId: string; latest: Stop | null; now: Date }
  /** `stop`: what playback would stop at, null when nothing is playing. */
  | { type: "tap" | "hidden"; stop: Stop | null; playing: boolean }
  | { type: "visible" | "tick" | "pickUp" | "done"; now: Date }

export type StopEffect =
  | { kind: "save" | "forget"; stop: Stop }
  | { kind: "count"; sessionId: string; path: Path }
  | { kind: "settle"; stop: Stop; outcome: Stop["outcome"]; at: string }
  | { kind: "pause" | "resume" | "start" | "end" }
  /** `plannedMs`: the plan at the stop, any "+5 min" included. */
  | { kind: "restart"; elapsedMs: number; plannedMs: number }

const NONE: StopState = { kind: "none" }

const count = (stop: { sessionId: string }, path: Path): StopEffect => ({
  kind: "count",
  sessionId: stop.sessionId,
  path,
})

/** Carry on as if the stop never happened: a paused session stays paused. */
function carryOn(playback: Playback, stop: Stop): Array<StopEffect> {
  if (playback === "remounted") {
    return [
      { kind: "restart", elapsedMs: stop.elapsedMs, plannedMs: stop.plannedMs },
    ]
  }
  return playback === "playing" ? [{ kind: "resume" }] : []
}

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
      const opened = count(event, "opens")
      if (stop?.outcome === "done" || stop?.outcome === "lapsed") {
        return [{ kind: "closed", stop }, [opened, { kind: "end" }]]
      }
      if (stop?.outcome !== "open") return [NONE, [opened, { kind: "start" }]]
      const away = msSinceStop(stop, event.now)
      if (away > PICK_UP_MS) {
        const [closed, effects] = close(stop, "lapsed", event.now)
        return [closed, [opened, ...effects]]
      }
      // Back in under a minute after leaving, even by Back and the app's own
      // links: a glance, as it is while the player stays mounted.
      if (stop.via === "left" && away < GLANCE_MS) {
        return [
          NONE,
          [
            opened,
            { kind: "forget", stop },
            count(stop, "glances"),
            ...carryOn("remounted", stop),
          ],
        ]
      }
      return [
        { kind: "open", stop, returning: true, playback: "remounted" },
        [opened],
      ]
    }
    case "tap":
    case "hidden": {
      const returning = event.type === "hidden"
      if (state.kind === "open") {
        // Leaving with the dialog up turns it into the return; a tap can't
        // reach it (the player is inert) and is ignored.
        return returning && !state.returning
          ? [{ ...state, returning }, []]
          : [state, []]
      }
      if (state.kind === "closed" || event.stop === null) return [state, []]
      const via: Stop["via"] = returning ? "left" : "tap"
      const stop: Stop = { ...event.stop, via }
      const playback = event.playing ? "playing" : "paused"
      return [
        { kind: "open", stop, returning, playback },
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
        return [
          NONE,
          [
            { kind: "forget", stop },
            count(stop, keepGoing ? "takenBack" : "glances"),
            ...carryOn(state.playback, stop),
          ],
        ]
      }
      if (event.type !== "pickUp") return [state, []]
      const at = event.now.toISOString()
      return [
        NONE,
        [
          { kind: "settle", stop, outcome: "resumed", at },
          count(stop, "pickUps"),
          ...carryOn(
            state.playback === "remounted" ? "remounted" : "playing",
            stop
          ),
        ],
      ]
    }
    default: {
      return assertNever(event)
    }
  }
}

/** Runs a "save", "settle", "forget" or "count" against the stored records. */
export function storeEffect(effect: StopEffect): void {
  if (effect.kind === "count") {
    const { sessionId, path } = effect
    const was = pathCounts(sessionId) ?? {
      sessionId,
      opens: 0,
      glances: 0,
      takenBack: 0,
      pickUps: 0,
    }
    paths.put(
      { ...was, [path]: was[path] + 1 },
      (p) => p.sessionId === sessionId
    )
  }
  if (effect.kind === "save") store.put(effect.stop, same(effect.stop))
  if (effect.kind === "forget") store.remove(same(effect.stop))
  if (effect.kind === "settle") {
    updateStop(effect.stop, { outcome: effect.outcome, settledAt: effect.at })
  }
}
