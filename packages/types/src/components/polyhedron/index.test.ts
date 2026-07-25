import { describe, expect, it } from "vitest"

import { safeParseViewportConfig } from "."

/**
 * The rest of this module's functions (isWasm*, validateWasm*, PolyhedronFactory,
 * TransitionFactory) are thin 1:1 delegations to a zod schema's `.parse`/
 * `.safeParse` - testing them would just be re-testing zod. safeParseViewportConfig
 * is the one function with real, non-delegated logic: turning zod's issue list
 * into a formatted error string.
 */
describe("safeParseViewportConfig", () => {
  it("returns the parsed config on valid input", () => {
    const config = {
      id: "scene-1",
      items: [{ contentIndex: 0, durationMs: 1000 }],
      polyhedron: { type: "cube" },
      cycleName: "cube:y",
      faceCapacity: 6,
    }

    const result = safeParseViewportConfig(config)

    expect(result).toEqual({ success: true, data: config })
  })

  it("formats every validation issue as 'path: message', joined by ', '", () => {
    const result = safeParseViewportConfig({
      id: "",
      items: [],
      polyhedron: { type: "cube" },
      cycleName: "cube:y",
      faceCapacity: 0,
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error("expected failure")

    const parts = result.error.split(", ")
    expect(parts).toContain(
      "id: Too small: expected string to have >=1 characters"
    )
    expect(parts).toContain(
      "items: Too small: expected array to have >=1 items"
    )
    expect(parts).toContain(
      "faceCapacity: Too small: expected number to be >=1"
    )
  })
})
