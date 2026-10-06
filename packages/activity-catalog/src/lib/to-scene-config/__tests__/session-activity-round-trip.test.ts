import { ACTIVITY_CATALOG, ACTIVITY_IDS } from "@activity-catalog/lib/catalog"
import { sequenceScenes } from "@activity-catalog/lib/to-scene-config"
import type { SessionActivity } from "@activity-catalog/lib/to-scene-config"
import { describe, expect, it } from "vitest"

/**
 * The round trip of `paulgsc/server#272`, from this side: `toSceneProps` is a
 * closure JSON cannot carry, so a server-composed session carries only
 * `SessionActivity` (`{ activityId, config }`), and `sequenceScenes` looks
 * `toSceneProps` up from this package's catalogue. `JSON.parse(JSON.stringify
 * (...))` strips what a server response would.
 */
describe("a server-composed SessionActivity list survives the JSON wire (server#272)", () => {
  const activities: ReadonlyArray<SessionActivity> = ACTIVITY_IDS.map((id) => ({
    activityId: id,
    config: ACTIVITY_CATALOG[id].defaultConfig,
  }))

  it("produces identical scenes whether or not the list crossed a JSON boundary", () => {
    const overTheWire: ReadonlyArray<SessionActivity> = JSON.parse(
      JSON.stringify(activities)
    )

    expect(sequenceScenes(overTheWire)).toEqual(sequenceScenes(activities))
  })

  it("builds a well-formed, playable scene for every catalogued activity from data alone", () => {
    const overTheWire: ReadonlyArray<SessionActivity> = JSON.parse(
      JSON.stringify(activities)
    )

    const scenes = sequenceScenes(overTheWire)
    expect(scenes).toHaveLength(ACTIVITY_IDS.length)

    scenes.forEach((scene, index) => {
      const activity = ACTIVITY_CATALOG[ACTIVITY_IDS[index]!]
      const mainContent = scene.ui[0]?.panels?.mainContent

      expect(mainContent?.registry_key).toBe(activity.registryKey)
      expect(mainContent?.props).toBeTypeOf("object")
      expect(scene.duration).toBeGreaterThan(0)
    })
  })
})
