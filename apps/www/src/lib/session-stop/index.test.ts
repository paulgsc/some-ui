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
  GLANCE_MS,
  latestStop,
  PICK_UP_MS,
  step,
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
const kinds = (event: StopEvent, state: StopState = NONE): Array<string> =>
  step(state, event)[1].map((e) => e.kind)

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
    expect(kinds({ type: "pickUp", now }, tapped)).toEqual(["forget", "resume"])
    expect(kinds({ type: "visible", now }, open(GLANCE_MS - 1))).toEqual([
      "forget",
      "resume",
    ])
    expect(kinds({ type: "visible", now }, open(GLANCE_MS + 1))).toEqual([])
  })

  it("after a glance, leaves a paused session paused and restarts a remounted one", () => {
    const glance = { type: "visible", now } as const
    expect(kinds(glance, open(0, { playback: "paused" }))).toEqual(["forget"])
    expect(kinds(glance, open(0, { playback: "remounted" }))).toEqual([
      "forget",
      "restart",
    ])
  })

  it("picks up in place, or at the scene once the activity remounted", () => {
    expect(step(open(5 * 60_000), { type: "pickUp", now })[1]).toEqual([
      expect.objectContaining({ kind: "settle", outcome: "resumed" }),
      { kind: "resume" },
    ])
    expect(
      step(open(5 * 60_000, { playback: "remounted" }), {
        type: "pickUp",
        now,
      })[1][1]
    ).toEqual({ kind: "restart", scene: "reading" })
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
        latest: stopRecord(0, { outcome: "done" }),
        now,
      })
    ).toEqual(["end"])
    expect(kinds({ type: "begin", latest: null, now })).toEqual(["start"])
  })
})

describe("stored stops", () => {
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
