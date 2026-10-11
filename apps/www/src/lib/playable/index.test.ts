/**
 * Which activities each build offers: those whose panel it binds. Vitest
 * builds the `lan` profile; the Android app's build is stood in for by its
 * flag, which closes the web surface's door (`@/lib/web-surface`).
 */

import { ACTIVITY_CATALOG, ACTIVITY_IDS } from "@some-ui/activity-catalog"
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

  it("still reject a retired id", async () => {
    const { isOfferedActivityId } = await loadFor("web")

    expect(isOfferedActivityId("interview")).toBe(false)
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
