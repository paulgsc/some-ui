import { describe, expect, it } from "vitest"

import { DEFAULT_NUDGE_PREFERENCES } from "@/lib/study-nudge/index"
import { nextNudge } from "@/lib/study-nudge/schedule"
import type { SessionRecord } from "@/lib/tenant/types"

// Local-time constructors throughout: the policy's quiet hours and "today"
// are the viewer's own, so the tests speak the same clock.
const at = (day: number, hour: number, minute = 0): Date =>
  new Date(2026, 8, day, hour, minute)

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "session-1",
    name: "Commute",
    status: "draft",
    activities: [],
    scenes: [],
    layoutMode: "basic",
    totalDurationMs: 600_000,
    createdAt: at(28, 9).toISOString(),
    updatedAt: at(28, 9).toISOString(),
    ...overrides,
  }
}

const enabled = { ...DEFAULT_NUDGE_PREFERENCES, enabled: true }

describe("nextNudge", () => {
  it("nudges soon about a prepared session outside quiet hours", () => {
    const next = nextNudge(
      { sessions: [session()], preferences: enabled, lastNudgeAt: null },
      at(29, 12, 3)
    )
    // At least a minute out, on the next 15-minute mark.
    expect(next?.at).toEqual(at(29, 12, 15))
    expect(next?.decision).toMatchObject({
      kind: "nudge",
      sessionId: "session-1",
    })
  })

  it("waits out quiet hours to the minute they end", () => {
    const next = nextNudge(
      { sessions: [session()], preferences: enabled, lastNudgeAt: null },
      at(29, 23, 10)
    )
    expect(next?.at).toEqual(at(30, 8))
  })

  it("after studying today, waits for tomorrow's first allowed hour", () => {
    const studied = session({
      status: "paused",
      startedAt: at(29, 7).toISOString(),
      finalElapsedMs: 60_000,
    })
    const next = nextNudge(
      { sessions: [studied], preferences: enabled, lastNudgeAt: null },
      at(29, 18)
    )
    expect(next?.at).toEqual(at(30, 8))
    expect(next?.decision.title).toBe("Pick up where you left off")
  })

  it("respects the cooldown from the last nudge shown", () => {
    const next = nextNudge(
      {
        sessions: [session()],
        preferences: enabled,
        lastNudgeAt: at(29, 12).toISOString(),
      },
      at(29, 13)
    )
    expect(next?.at).toEqual(at(29, 16))
  })

  it.each([
    ["reminders are off", DEFAULT_NUDGE_PREFERENCES, [session()]],
    ["nothing is prepared", enabled, [session({ status: "completed" })]],
    ["a session is running", enabled, [session({ status: "active" })]],
  ] as const)("schedules nothing when %s", (_why, preferences, sessions) => {
    expect(
      nextNudge({ sessions, preferences, lastNudgeAt: null }, at(29, 12))
    ).toBeNull()
  })
})
