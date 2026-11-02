/**
 * @vitest-environment jsdom
 */

import { seedStop, stopRecord } from "@/test-support/session-stop"
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import type { StopEvent, StopState } from "@/lib/session-stop"
import {
  closedPatch,
  closingStop,
  cutShortStop,
  GLANCE_MS,
  latestStop,
  pathCounts,
  PICK_UP_MS,
  step,
  storeEffect,
  updateStop,
} from "@/lib/session-stop"

// Frozen, so a fixture's "ago" is exact against `now`.
const now = new Date("2026-10-06T12:00:00.000Z")
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"], now })
})
afterAll(() => {
  vi.useRealTimers()
})
const NONE: StopState = { kind: "none" }
const open = (
  agoMs: number,
  over: Partial<Extract<StopState, { kind: "open" }>> = {}
): StopState => ({
  kind: "open",
  stop: stopRecord(agoMs),
  returning: true,
  playback: "playing",
  ...over,
})
/** Each effect's kind, a count as "count:<path>". */
const kinds = (event: StopEvent, state: StopState = NONE): Array<string> =>
  step(state, event)[1].map((e) =>
    e.kind === "count" ? `count:${e.path}` : e.kind
  )

beforeEach(() => {
  localStorage.clear()
})

describe("a stop's machine", () => {
  it("keeps a stop on a tap or on leaving, never when nothing plays", () => {
    const [tapped, effects] = step(NONE, {
      type: "tap",
      stop: stopRecord(),
      playing: true,
    })
    expect(tapped).toMatchObject({ kind: "open", returning: false })
    expect(effects.map((e) => e.kind)).toEqual(["pause", "save"])
    expect(
      step(NONE, { type: "hidden", stop: stopRecord(), playing: true })[0]
    ).toMatchObject({ kind: "open", returning: true, stop: { via: "left" } })
    expect(step(NONE, { type: "tap", stop: null, playing: false })[0]).toBe(
      NONE
    )
  })

  it("forgets a mis-tap and a glance, and resumes in place", () => {
    const tapped = open(0, { returning: false })
    expect(kinds({ type: "pickUp", now }, tapped)).toEqual([
      "forget",
      "count:takenBack",
      "resume",
    ])
    expect(kinds({ type: "visible", now }, open(GLANCE_MS - 1))).toEqual([
      "forget",
      "count:glances",
      "resume",
    ])
    expect(kinds({ type: "visible", now }, open(GLANCE_MS + 1))).toEqual([])
  })

  it("after a glance, leaves a paused session paused and restarts a remounted one", () => {
    const glance = { type: "visible", now } as const
    expect(kinds(glance, open(0, { playback: "paused" }))).toEqual([
      "forget",
      "count:glances",
    ])
    expect(kinds(glance, open(0, { playback: "remounted" }))).toEqual([
      "forget",
      "count:glances",
      "restart",
    ])
  })

  it("picks up in place, or where it stopped once the activity remounted", () => {
    expect(step(open(5 * 60_000), { type: "pickUp", now })[1]).toEqual([
      expect.objectContaining({ kind: "settle", outcome: "resumed" }),
      { kind: "count", sessionId: "session-1", path: "pickUps" },
      { kind: "resume" },
    ])
    expect(
      step(open(5 * 60_000, { playback: "remounted" }), {
        type: "pickUp",
        now,
      })[1][2]
    ).toEqual({ kind: "restart", elapsedMs: 738_000, plannedMs: 1_200_000 })
  })

  it("calls it done where it stopped", () => {
    expect(step(open(5 * 60_000), { type: "done", now })[0]).toMatchObject({
      kind: "closed",
      stop: { outcome: "done", elapsedMs: 738_000 },
    })
  })

  it("closes past the window on any event, even with the screen still up", () => {
    for (const type of ["tick", "visible", "pickUp"] as const) {
      const [next, effects] = step(open(PICK_UP_MS + 1), { type, now })
      expect(next).toMatchObject({
        kind: "closed",
        stop: { outcome: "lapsed" },
      })
      expect(effects.map((e) => e.kind)).toEqual(["settle", "end"])
    }
  })

  it("on reopening: offers the pick-up, lapses, or retries a failed close", () => {
    const begin = (agoMs: number, outcome = "open" as const): StopState =>
      step(NONE, {
        type: "begin",
        sessionId: "session-1",
        latest: stopRecord(agoMs, { outcome }),
        now,
      })[0]

    expect(begin(5 * 60_000)).toMatchObject({
      kind: "open",
      playback: "remounted",
    })
    expect(begin(PICK_UP_MS + 1)).toMatchObject({ kind: "closed" })
    expect(
      kinds({
        type: "begin",
        sessionId: "session-1",
        latest: stopRecord(0, { outcome: "done" }),
        now,
      })
    ).toEqual(["count:opens", "end"])
    expect(
      kinds({ type: "begin", sessionId: "session-1", latest: null, now })
    ).toEqual(["count:opens", "start"])
  })

  it("on reopening within a minute of leaving, carries on where it was", () => {
    const begin = (stop: ReturnType<typeof stopRecord>): Array<string> =>
      kinds({ type: "begin", sessionId: "session-1", latest: stop, now })

    expect(begin(stopRecord(GLANCE_MS - 1))).toEqual([
      "count:opens",
      "forget",
      "count:glances",
      "restart",
    ])
    // A tap is meant: its screen stays, however soon.
    expect(begin(stopRecord(0, { via: "tap" }))).toEqual(["count:opens"])
    expect(begin(stopRecord(GLANCE_MS + 1))).toEqual(["count:opens"])
  })
})

describe("stored stops", () => {
  it("counts each path per session", () => {
    const counted = (sessionId: string, path: "opens" | "glances"): void =>
      storeEffect({ kind: "count", sessionId, path })
    counted("a", "opens")
    counted("a", "opens")
    counted("a", "glances")
    counted("b", "opens")

    expect(pathCounts("a")).toEqual({
      sessionId: "a",
      opens: 2,
      glances: 1,
      takenBack: 0,
      pickUps: 0,
    })
    expect(pathCounts("b")?.opens).toBe(1)
    expect(pathCounts("c")).toBeNull()
  })

  it('is cut short against the plan at the stop, "+5 min" included', () => {
    const MIN = 60_000
    const stopAt = (elapsedMs: number): void => {
      localStorage.clear()
      seedStop(
        stopRecord(0, { elapsedMs, plannedMs: 25 * MIN, outcome: "done" })
      )
    }

    stopAt(21 * MIN)
    expect(cutShortStop("session-1")).not.toBeNull()
    stopAt(24 * MIN)
    expect(cutShortStop("session-1")).toBeNull()
  })

  it("merges an update into the stored record, not a stale copy", () => {
    const stale = seedStop(stopRecord())
    updateStop(stale, { reason: "call", reasonFrom: "return" })

    expect(updateStop(stale, { outcome: "done" }).reason).toBe("call")
  })

  it("closes a session at its stop, dated by how it ended", () => {
    const stop = seedStop(stopRecord(PICK_UP_MS + 1))

    const closing = closingStop(stop.sessionId, now)

    expect(latestStop(stop.sessionId)?.outcome).toBe("lapsed")
    expect(closing && closedPatch(closing)).toEqual({
      status: "completed",
      completedAt: stop.stoppedAt,
      finalElapsedMs: 738_000,
    })
    expect(closingStop("other", now)).toBeNull()
  })
})
