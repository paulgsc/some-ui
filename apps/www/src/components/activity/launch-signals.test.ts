import { describe, expect, it } from "vitest"

import type { SessionRecord, SessionStatus } from "@/lib/tenant"

import { playsFromSessions } from "./launch-signals"

function session(
  overrides: Partial<SessionRecord> & { status: SessionStatus }
): SessionRecord {
  return {
    id: "s1",
    name: "Session",
    activities: [{ activityId: "honeycomb", config: {} }],
    scenes: [],
    layoutMode: "basic",
    totalDurationMs: 0,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
    ...overrides,
  }
}

describe("playsFromSessions", () => {
  it("counts a completed session as a play", () => {
    const plays = playsFromSessions([
      session({ status: "completed", startedAt: "2026-07-02T09:00:00.000Z" }),
    ])

    expect(plays).toEqual([
      { activityId: "honeycomb", at: Date.parse("2026-07-02T09:00:00.000Z") },
    ])
  })

  it("does not count a draft nobody ever started", () => {
    expect(playsFromSessions([session({ status: "draft" })])).toEqual([])
    expect(playsFromSessions([session({ status: "scheduled" })])).toEqual([])
  })

  it("counts a scheduled session that was started anyway", () => {
    const plays = playsFromSessions([
      session({ status: "scheduled", startedAt: "2026-07-02T09:00:00.000Z" }),
    ])

    expect(plays).toHaveLength(1)
  })

  it("falls back to updatedAt for a played record with no startedAt", () => {
    const plays = playsFromSessions([session({ status: "paused" })])

    expect(plays[0].at).toBe(Date.parse("2026-07-02T00:00:00.000Z"))
  })

  it("counts one play per activity instance, repeats included", () => {
    const plays = playsFromSessions([
      session({
        status: "completed",
        activities: [
          { activityId: "honeycomb", config: {} },
          { activityId: "honeycomb", config: {} },
          { activityId: "topik", config: {} },
        ],
      }),
    ])

    expect(plays.map((play) => play.activityId)).toEqual([
      "honeycomb",
      "honeycomb",
      "topik",
    ])
  })

  it("drops a record whose timestamps are unparseable rather than ranking on NaN", () => {
    expect(
      playsFromSessions([session({ status: "completed", updatedAt: "soon" })])
    ).toEqual([])
  })
})
