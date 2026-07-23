import { describe, expect, it } from "vitest"

import type { ActivityId } from "@/lib/activity-catalog"

import { buildSessionActivities, defaultSessionName } from "./utils"

describe("defaultSessionName", () => {
  it("returns a fallback for an empty session", () => {
    expect(defaultSessionName([])).toBe("New session")
  })

  it("joins distinct activities by name", () => {
    expect(defaultSessionName(["honeycomb", "topik"])).toBe(
      "Hangul Honeycomb + TOPIK Study"
    )
  })

  it("labels repeated instances of the same activity with a ×N count instead of repeating the name", () => {
    expect(defaultSessionName(["honeycomb", "honeycomb"])).toBe(
      "Hangul Honeycomb ×2"
    )
  })

  it("counts repeats regardless of where they fall in the order", () => {
    expect(defaultSessionName(["honeycomb", "topik", "honeycomb"])).toBe(
      "Hangul Honeycomb ×2 + TOPIK Study"
    )
  })
})

describe("buildSessionActivities", () => {
  it("preserves order and repetition, dropping only the composer-local instanceId", () => {
    // A variable typed with the extra instanceId field, not an inline object
    // literal, so this exercises the same structural-subtyping call shape
    // the composer itself uses when it passes its ComposerActivity[] state
    // straight through.
    const composerItems: Array<{
      instanceId: string
      activityId: ActivityId
      config: Record<string, string>
    }> = [
      {
        instanceId: "a",
        activityId: "honeycomb",
        config: { mode: "completion" },
      },
      {
        instanceId: "b",
        activityId: "honeycomb",
        config: { mode: "vocabulary" },
      },
      { instanceId: "c", activityId: "topik", config: { level: "advanced" } },
    ]

    const result = buildSessionActivities(composerItems)

    expect(result).toEqual([
      { activityId: "honeycomb", config: { mode: "completion" } },
      { activityId: "honeycomb", config: { mode: "vocabulary" } },
      { activityId: "topik", config: { level: "advanced" } },
    ])
  })

  it("returns an empty list for no activities", () => {
    expect(buildSessionActivities([])).toEqual([])
  })
})
