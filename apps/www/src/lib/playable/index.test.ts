/**
 * Which activities each build offers: those whose panel it binds. Vitest
 * builds the `lan` profile; the Android app's build is stood in for by its
 * flag, which closes the web surface's door (`@/lib/web-surface`).
 */

import { ACTIVITY_CATALOG, ACTIVITY_IDS } from "@some-ui/activity-catalog"
import type { SceneConfig } from "@some-ui/types"
import { afterEach, describe, expect, it, vi } from "vitest"

import type * as Playable from "."

async function loadFor(build: "web" | "apk"): Promise<typeof Playable> {
  vi.resetModules()
  vi.stubEnv("VITE_DEVICE_BACKEND", build === "apk" ? "true" : "")
  return import(".")
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe("the Android app", () => {
  it("does not offer Hangul Honeycomb, and offers everything else", async () => {
    const { OFFERED_ACTIVITIES } = await loadFor("apk")

    expect(OFFERED_ACTIVITIES.map((activity) => activity.id)).toEqual(
      ACTIVITY_IDS.filter((id) => id !== "honeycomb")
    )
  })

  it("reads honeycomb as retired, so links and edits drop it", async () => {
    const { isOfferedActivityId } = await loadFor("apk")

    expect(isOfferedActivityId("honeycomb")).toBe(false)
    expect(isOfferedActivityId("topik")).toBe(true)
  })
})

describe("the web builds", () => {
  it("offer the whole catalogue, honeycomb included", async () => {
    const { OFFERED_ACTIVITIES, isOfferedActivityId } = await loadFor("web")

    expect(OFFERED_ACTIVITIES.map((activity) => activity.id)).toEqual(
      ACTIVITY_IDS
    )
    expect(isOfferedActivityId("honeycomb")).toBe(true)
  })
})

describe("every activity", () => {
  it("has its panel bound by at least one build", async () => {
    const bound = new Set([
      ...Object.keys((await loadFor("web")).PANELS),
      ...Object.keys((await loadFor("apk")).PANELS),
    ])

    for (const id of ACTIVITY_IDS) {
      expect(bound, id).toContain(ACTIVITY_CATALOG[id].registryKey)
    }
  })
})

const scene = (
  scene_name: string,
  start_time: number,
  ...keys: Array<string>
): SceneConfig => ({
  scene_name,
  duration: 60_000,
  start_time,
  ui: [
    {
      panels: Object.fromEntries(
        keys.map((registry_key, i) => [`r${i}`, { registry_key }])
      ),
    },
  ],
})

describe("a stored Advanced arrangement", () => {
  const stored = [
    scene("honeycomb", 0, "hangul"),
    scene("mixed", 60_000, "hangul", "leetype"),
    scene("topik", 120_000, "topik"),
  ]

  it("loses in the Android app what it cannot play, and closes up", async () => {
    const { playableScenes } = await loadFor("apk")

    expect(playableScenes(stored)).toEqual([
      {
        ...scene("mixed", 0, "leetype"),
        ui: [{ panels: { r1: { registry_key: "leetype" } } }],
      },
      scene("topik", 60_000, "topik"),
    ])
  })

  it("is left as it is where everything is bound", async () => {
    const { playableScenes } = await loadFor("web")

    expect(playableScenes(stored)).toBe(stored)
  })
})
