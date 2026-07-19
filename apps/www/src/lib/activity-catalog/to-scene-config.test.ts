import { describe, expect, it } from "vitest"

import { ACTIVITY_CATALOG, ACTIVITY_IDS, getActivity } from "./catalog"
import { LAYOUT_TEMPLATES } from "./layout-templates"
import { layoutTreeFor, sequenceScenes, toSceneConfig } from "./to-scene-config"
import type { ActivityId } from "./types"

describe("ACTIVITY_CATALOG", () => {
  it("has an entry for every ActivityId, keyed consistently", () => {
    for (const id of ACTIVITY_IDS) {
      expect(ACTIVITY_CATALOG[id].id).toBe(id)
    }
  })

  it("every field key exists in defaultConfig, and vice versa for non-duration fields", () => {
    for (const id of ACTIVITY_IDS) {
      const activity = getActivity(id)
      for (const field of activity.fields) {
        expect(activity.defaultConfig).toHaveProperty(field.key)
      }
    }
  })

  it("toSceneProps never throws when given the activity's own defaultConfig", () => {
    for (const id of ACTIVITY_IDS) {
      const activity = getActivity(id)
      expect(() => activity.toSceneProps(activity.defaultConfig)).not.toThrow()
    }
  })
})

describe("toSceneConfig", () => {
  it("converts durationMinutes into milliseconds", () => {
    const scene = toSceneConfig(
      "leetype",
      { language: "rust", difficulty: "medium", durationMinutes: 5 },
      { startTime: 0 }
    )
    expect(scene.duration).toBe(5 * 60_000)
  })

  it("falls back to the activity's default duration when omitted from config", () => {
    const scene = toSceneConfig(
      "honeycomb",
      { mode: "endless" },
      { startTime: 0 }
    )
    expect(scene.duration).toBe(10 * 60_000)
  })

  it("places the registry component and its props under panels.mainContent", () => {
    const scene = toSceneConfig(
      "topik",
      { level: "advanced", durationMinutes: 15 },
      { startTime: 1_000 }
    )
    expect(scene.start_time).toBe(1_000)
    expect(scene.ui[0]?.panels?.mainContent?.registry_key).toBe("topik")
    expect(scene.ui[0]?.panels?.mainContent?.props).toEqual({
      path: "topiks/advanced.json",
    })
  })

  it("seeds layout from the activity's declared template, cloned independently per scene", () => {
    const first = toSceneConfig(
      "honeycomb",
      { mode: "completion", durationMinutes: 5 },
      { startTime: 0 }
    )
    const second = toSceneConfig(
      "honeycomb",
      { mode: "completion", durationMinutes: 5 },
      { startTime: 0 }
    )

    expect(first.layout).toEqual(LAYOUT_TEMPLATES.study)
    expect(second.layout).toEqual(LAYOUT_TEMPLATES.study)
    expect(first.layout).not.toBe(second.layout)
    expect(first.layout).not.toBe(LAYOUT_TEMPLATES.study)
  })

  it("scopes scene_name with an instanceLabel when given, and leaves it bare otherwise", () => {
    const bare = toSceneConfig(
      "leetype",
      { durationMinutes: 5 },
      { startTime: 0 }
    )
    expect(bare.scene_name).toBe("leetype")

    const labeled = toSceneConfig(
      "leetype",
      { durationMinutes: 5 },
      { startTime: 0, instanceLabel: "1" }
    )
    expect(labeled.scene_name).toBe("leetype-1")
  })
})

describe("sequenceScenes", () => {
  it("lays scenes back-to-back with no gaps or overlaps", () => {
    const scenes = sequenceScenes([
      {
        activityId: "honeycomb",
        config: { mode: "completion", durationMinutes: 5 },
      },
      {
        activityId: "leetype",
        config: { language: "typescript", durationMinutes: 10 },
      },
    ])

    expect(scenes[0]?.start_time).toBe(0)
    expect(scenes[0]?.duration).toBe(5 * 60_000)
    expect(scenes[1]?.start_time).toBe(5 * 60_000)
    expect(scenes[1]?.duration).toBe(10 * 60_000)
  })

  it("gives each scene a unique scene_name even for repeated activities", () => {
    const scenes = sequenceScenes([
      { activityId: "leetype", config: { durationMinutes: 5 } },
      { activityId: "leetype", config: { durationMinutes: 5 } },
    ])
    const names = new Set(scenes.map((s) => s.scene_name))
    expect(names.size).toBe(2)
  })

  it("returns an empty list for an empty session", () => {
    expect(sequenceScenes([])).toEqual([])
  })
})

describe("layoutTreeFor", () => {
  it("returns the catalog's declared layout tree per activity", () => {
    const expected: Record<ActivityId, string> = {
      honeycomb: "study",
      topik: "topik",
      interview: "topik",
      leetype: "study",
    }
    for (const id of ACTIVITY_IDS) {
      expect(layoutTreeFor(id)).toBe(expected[id])
    }
  })
})
