import { describe, expect, it } from "vitest"

import {
  checkSessionDuration,
  DEFAULT_SESSION_DURATION_POLICY,
  describeDurationCheck,
} from "./index"

function scene(
  name: string,
  minutes: number
): { scene_name: string; duration: number } {
  return { scene_name: name, duration: minutes * 60_000 }
}

describe("checkSessionDuration", () => {
  it("is valid for a normal single activity within bounds", () => {
    expect(checkSessionDuration([scene("honeycomb", 10)])).toEqual({
      state: "valid",
    })
  })

  it("is valid for an empty session (nothing to violate yet)", () => {
    expect(checkSessionDuration([])).toEqual({ state: "valid" })
  })

  it("flags a scene below the per-activity minimum", () => {
    const result = checkSessionDuration([scene("honeycomb", 2)])
    expect(result.state).toBe("too-short")
    if (result.state === "too-short") {
      expect(result.sceneName).toBe("honeycomb")
      expect(result.actualMinutes).toBe(2)
      expect(result.minMinutes).toBe(5)
    }
  })

  it("flags a zero-duration scene", () => {
    const result = checkSessionDuration([scene("honeycomb", 0)])
    expect(result.state).toBe("too-short")
  })

  it("flags a combined total above the session cap even when every individual scene is fine", () => {
    // 10 honeycomb blocks x 30 min = 5 hours, over the 4-hour default cap.
    const scenes = Array.from({ length: 10 }, (_, i) =>
      scene(`honeycomb-${i}`, 30)
    )
    const result = checkSessionDuration(scenes)
    expect(result.state).toBe("too-long")
    if (result.state === "too-long") {
      expect(result.totalMinutes).toBe(300)
      expect(result.maxMinutes).toBe(240)
    }
  })

  it("checks the per-activity floor before the total ceiling", () => {
    // Deliberately both-wrong input - one scene under the floor - to pin
    // which violation is reported first.
    const scenes = [scene("a", 1), scene("b", 300)]
    const result = checkSessionDuration(scenes)
    expect(result.state).toBe("too-short")
  })

  it("respects a custom policy instead of the default", () => {
    const looser = { minActivityDurationMs: 0, maxTotalDurationMs: 60 * 60_000 }
    expect(checkSessionDuration([scene("a", 0)], looser)).toEqual({
      state: "valid",
    })
  })

  it("is valid exactly at the boundary values", () => {
    expect(
      checkSessionDuration([scene("a", 5)], DEFAULT_SESSION_DURATION_POLICY)
    ).toEqual({ state: "valid" })
    expect(
      checkSessionDuration([scene("a", 240)], DEFAULT_SESSION_DURATION_POLICY)
    ).toEqual({ state: "valid" })
  })
})

describe("describeDurationCheck", () => {
  it("returns null for a valid check", () => {
    expect(describeDurationCheck({ state: "valid" })).toBeNull()
  })

  it("names the offending scene for too-short", () => {
    const message = describeDurationCheck({
      state: "too-short",
      sceneName: "honeycomb-0",
      actualMinutes: 2,
      minMinutes: 5,
    })
    expect(message).toContain("honeycomb-0")
    expect(message).toContain("5-minute minimum")
  })

  it("formats hour+minute totals for too-long instead of raw minutes", () => {
    const message = describeDurationCheck({
      state: "too-long",
      totalMinutes: 300,
      maxMinutes: 240,
    })
    expect(message).toBe("Total duration (5h) exceeds the 4h session cap.")
  })

  it("formats a non-clean-hour cap correctly", () => {
    const message = describeDurationCheck({
      state: "too-long",
      totalMinutes: 100,
      maxMinutes: 90,
    })
    expect(message).toBe(
      "Total duration (1h 40m) exceeds the 1h 30m session cap."
    )
  })
})
