import { ACTIVITY_CATALOG, ACTIVITY_IDS } from "@activity-catalog/lib/catalog"
import { describe, expect, it } from "vitest"

import { sequenceScenes } from "."
import type { SessionActivity } from "."

/**
 * `paulgsc/server#272`'s round trip, checked from this side of the
 * boundary: `toSceneProps` is a closure, and JSON has no encoding for one,
 * so a server-composed session can never carry it. What it *can* carry is
 * exactly `SessionActivity` — `{ activityId, config }` — and #272's whole
 * argument is that this is already sufficient, because `sequenceScenes`
 * only ever needed that much: it looks `toSceneProps` up from this
 * package's own catalogue, it does not expect the caller to supply it.
 *
 * `JSON.parse(JSON.stringify(...))` simulates the one thing a server
 * response actually does to this data that a same-process object never
 * would: strip anything that isn't representable as JSON. Running the
 * catalogue's own `defaultConfig` through that boundary and confirming
 * `sequenceScenes` produces identical output either side of it is the
 * server-composed-session case in miniature.
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
