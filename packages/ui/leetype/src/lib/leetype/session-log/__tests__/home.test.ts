import {
  finishedSessions,
  homeFormOf,
} from "@leetype/lib/leetype/session-log/home"
import type { SessionEvent } from "@leetype/lib/leetype/session-log/model"
import { describe, expect, it } from "vitest"

let n = 0
function stamp(session: string): { id: string; at: string; session: string } {
  n += 1
  const at = new Date(Date.UTC(2026, 9, 24, 20) + n * 1000).toISOString()
  return { id: `e${String(n)}`, at, session }
}

const on = { file: "t1-01-one-node.json", screen: "t1" }

const started = (session: string): SessionEvent => ({
  ...stamp(session),
  type: "started",
  file: on.file,
  form: "full",
  declaredMinutes: 10,
})

const parked = (session: string): SessionEvent => ({
  ...stamp(session),
  ...on,
  type: "parked",
})

const ended = (session: string): SessionEvent => ({
  ...stamp(session),
  ...on,
  type: "ended",
  how: "declared",
})

describe("homeFormOf", () => {
  it("leaves a spoken answer's ticks on the phone, and keeps the rest", () => {
    const recorded: SessionEvent = {
      ...stamp("s"),
      ...on,
      type: "spoken",
      answer: { as: "recorded", seconds: 41.5, ticks: ["p1"], strong: true },
    }
    const typed: SessionEvent = {
      ...stamp("s"),
      ...on,
      type: "spoken",
      answer: { as: "typed", ticks: [], strong: false },
    }
    expect(homeFormOf(recorded)).toEqual({
      ...recorded,
      answer: { as: "recorded", seconds: 41.5, strong: true },
    })
    expect(homeFormOf(typed)).toEqual({
      ...typed,
      answer: { as: "typed", strong: false },
    })
    expect(JSON.stringify(homeFormOf(recorded))).not.toContain("ticks")
  })

  it("sends every other event as it was kept", () => {
    const passed: SessionEvent = {
      ...stamp("s"),
      ...on,
      type: "spoken",
      answer: { as: "passed" },
    }
    for (const event of [started("s"), parked("s"), passed, ended("s")]) {
      expect(homeFormOf(event)).toBe(event)
    }
  })
})

describe("finishedSessions", () => {
  it("takes a session that ended, with its events in order", () => {
    const a = [started("a"), parked("a"), ended("a")]
    expect(finishedSessions(a)).toEqual([{ session: "a", events: a }])
  })

  it("takes a session left open once another started after it", () => {
    const a = [started("a"), parked("a")]
    const b = [started("b"), parked("b")]
    expect(finishedSessions([...a, ...b])).toEqual([
      { session: "a", events: a },
    ])
  })

  it("leaves out the newest session while it is open", () => {
    expect(finishedSessions([started("a"), parked("a")])).toEqual([])
  })

  it("reads the order by time, not by where the store laid a session out", () => {
    const b = [started("b"), ended("b")]
    const a = [started("a"), parked("a")]
    // The store lays the log out session by session, so a later session can
    // sit first; b's start, before a's events, does not close a.
    expect(finishedSessions([...a, ...b]).map((s) => s.session)).toEqual(["b"])
    const c = [started("c")]
    expect(finishedSessions([...a, ...b, ...c]).map((s) => s.session)).toEqual([
      "b",
      "a",
    ])
  })
})
