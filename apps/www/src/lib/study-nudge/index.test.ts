import { describe, expect, it } from "vitest"

import type { SessionActivity } from "@some-ui/activity-catalog"

import type { SessionRecord } from "../tenant/types"
import type { NudgePreferences } from "./index"
import {
  decideNudge,
  DEFAULT_NUDGE_PREFERENCES,
  isWithinQuietHours,
  withNudgeDefaults,
} from "./index"

const PREFS: NudgePreferences = { ...DEFAULT_NUDGE_PREFERENCES, enabled: true }

/** 14:00 local — outside the default 22→8 quiet range on any machine. */
function atHour(hour: number, day = 15): Date {
  return new Date(2026, 2, day, hour, 0, 0)
}

const NOON = atHour(14)

/** Only the count is ever read, so the config is left empty on purpose. */
function activity(activityId: SessionActivity["activityId"]): SessionActivity {
  return { activityId, config: {} }
}

function session(
  overrides: Partial<SessionRecord> & { id: string }
): SessionRecord {
  return {
    name: "Korean review",
    status: "scheduled",
    activities: [],
    scenes: [],
    layoutMode: "basic",
    totalDurationMs: 10 * 60_000,
    createdAt: "2026-03-14T09:00:00.000Z",
    updatedAt: "2026-03-14T09:00:00.000Z",
    ...overrides,
  }
}

function decide(
  sessions: Array<SessionRecord>,
  overrides: Partial<Parameters<typeof decideNudge>[0]> = {}
): ReturnType<typeof decideNudge> {
  return decideNudge({
    sessions,
    now: NOON,
    pageVisible: false,
    lastNudgeAt: null,
    preferences: PREFS,
    ...overrides,
  })
}

describe("isWithinQuietHours", () => {
  it("handles a same-day range", () => {
    expect(isWithinQuietHours(3, 1, 6)).toBe(true)
    expect(isWithinQuietHours(6, 1, 6)).toBe(false)
    expect(isWithinQuietHours(1, 1, 6)).toBe(true)
  })

  it("wraps midnight for the default 22 -> 8 range", () => {
    expect(isWithinQuietHours(23, 22, 8)).toBe(true)
    expect(isWithinQuietHours(3, 22, 8)).toBe(true)
    expect(isWithinQuietHours(8, 22, 8)).toBe(false)
    expect(isWithinQuietHours(14, 22, 8)).toBe(false)
  })

  it("treats equal bounds as no quiet hours rather than always quiet", () => {
    expect(isWithinQuietHours(0, 9, 9)).toBe(false)
    expect(isWithinQuietHours(9, 9, 9)).toBe(false)
  })
})

describe("decideNudge", () => {
  it("nudges when a scheduled session is waiting and nothing blocks it", () => {
    const result = decide([session({ id: "s1", name: "Hangul drill" })])
    expect(result.kind).toBe("nudge")
    if (result.kind === "nudge") {
      expect(result.sessionId).toBe("s1")
      expect(result.title).toBe("Today's session is ready")
      expect(result.body).toContain("Hangul drill")
      expect(result.body).toContain("~10 min")
    }
  })

  it("stays silent when reminders are off, even with everything else ready", () => {
    expect(
      decide([session({ id: "s1" })], {
        preferences: { ...PREFS, enabled: false },
      })
    ).toEqual({ kind: "silent", reason: "disabled" })
  })

  it("stays silent while the app is on screen", () => {
    expect(decide([session({ id: "s1" })], { pageVisible: true })).toEqual({
      kind: "silent",
      reason: "page-visible",
    })
  })

  it("stays silent during quiet hours", () => {
    expect(decide([session({ id: "s1" })], { now: atHour(23) })).toEqual({
      kind: "silent",
      reason: "quiet-hours",
    })
  })

  it("stays silent while a session is actually running", () => {
    const result = decide([
      session({ id: "s1" }),
      session({ id: "s2", status: "active" }),
    ])
    expect(result).toEqual({ kind: "silent", reason: "session-in-progress" })
  })

  it("stays silent once something was started today", () => {
    const result = decide([
      session({ id: "s1" }),
      session({
        id: "s2",
        status: "completed",
        startedAt: atHour(9).toISOString(),
        completedAt: atHour(10).toISOString(),
      }),
    ])
    expect(result).toEqual({ kind: "silent", reason: "studied-today" })
  })

  it("nudges again the next day, when yesterday's session is the only history", () => {
    const result = decide([
      session({ id: "s1" }),
      session({
        id: "s2",
        status: "completed",
        startedAt: atHour(9, 14).toISOString(),
        completedAt: atHour(10, 14).toISOString(),
      }),
    ])
    expect(result.kind).toBe("nudge")
  })

  it("stays silent when nothing is prepared", () => {
    expect(decide([])).toEqual({ kind: "silent", reason: "nothing-prepared" })
    expect(decide([session({ id: "s1", status: "completed" })])).toEqual({
      kind: "silent",
      reason: "nothing-prepared",
    })
  })

  it("stays silent inside the cooldown and speaks again once it lapses", () => {
    const sessions = [session({ id: "s1" })]
    const twoHoursAgo = new Date(NOON.getTime() - 2 * 3_600_000).toISOString()
    const sixHoursAgo = new Date(NOON.getTime() - 6 * 3_600_000).toISOString()

    expect(decide(sessions, { lastNudgeAt: twoHoursAgo })).toEqual({
      kind: "silent",
      reason: "cooling-down",
    })
    expect(decide(sessions, { lastNudgeAt: sixHoursAgo }).kind).toBe("nudge")
  })

  it("reports the more specific reason when nothing is prepared AND it is cooling down", () => {
    const twoHoursAgo = new Date(NOON.getTime() - 2 * 3_600_000).toISOString()
    expect(decide([], { lastNudgeAt: twoHoursAgo })).toEqual({
      kind: "silent",
      reason: "nothing-prepared",
    })
  })

  it("treats an unparseable cooldown stamp as expired rather than muting forever", () => {
    expect(
      decide([session({ id: "s1" })], { lastNudgeAt: "not-a-date" }).kind
    ).toBe("nudge")
  })

  it("prefers a paused session over a scheduled one, and says what is left", () => {
    const result = decide([
      session({ id: "scheduled", status: "scheduled" }),
      session({
        id: "paused",
        name: "TOPIK reading",
        status: "paused",
        totalDurationMs: 20 * 60_000,
        finalElapsedMs: 8 * 60_000,
      }),
    ])
    expect(result.kind).toBe("nudge")
    if (result.kind === "nudge") {
      expect(result.sessionId).toBe("paused")
      expect(result.title).toBe("Pick up where you left off")
      expect(result.body).toBe("TOPIK reading · 12 min left")
    }
  })

  it("prefers a scheduled session over a draft", () => {
    const result = decide([
      session({ id: "draft", status: "draft" }),
      session({ id: "scheduled", status: "scheduled" }),
    ])
    expect(result.kind === "nudge" && result.sessionId).toBe("scheduled")
  })

  it("breaks a rank tie by most recently updated", () => {
    const result = decide([
      session({ id: "older", updatedAt: "2026-03-14T09:00:00.000Z" }),
      session({ id: "newer", updatedAt: "2026-03-14T18:00:00.000Z" }),
    ])
    expect(result.kind === "nudge" && result.sessionId).toBe("newer")
  })

  it("pluralises the activity count", () => {
    const one = decide([
      session({ id: "s1", activities: [activity("honeycomb")] }),
    ])
    expect(one.kind === "nudge" && one.body).toContain("1 activity")

    const two = decide([
      session({
        id: "s1",
        activities: [activity("honeycomb"), activity("topik")],
      }),
    ])
    expect(two.kind === "nudge" && two.body).toContain("2 activities")
  })
})

describe("withNudgeDefaults", () => {
  it("fills a block a browser stored before the field existed", () => {
    expect(withNudgeDefaults(undefined)).toEqual(DEFAULT_NUDGE_PREFERENCES)
  })

  it("keeps stored values and fills only the gaps", () => {
    expect(withNudgeDefaults({ enabled: true, quietHoursStart: 21 })).toEqual({
      ...DEFAULT_NUDGE_PREFERENCES,
      enabled: true,
      quietHoursStart: 21,
    })
  })
})
