import { describe, expect, it } from "vitest"

import { getActivity } from "./catalog"
import { defaultSessionName, summarizeConfig } from "./summary"

describe("summarizeConfig", () => {
  it("reads a select field back as its human label, not its stored value", () => {
    const topik = getActivity("topik")

    expect(
      summarizeConfig(topik, { level: "intermediate", durationMinutes: 15 })
    ).toBe("Intermediate • 15 min")
  })

  it("falls back to the raw value when a stored option no longer exists", () => {
    // A session saved before an option was renamed still has to render.
    const topik = getActivity("topik")

    expect(
      summarizeConfig(topik, { level: "retired-level", durationMinutes: 15 })
    ).toBe("retired-level • 15 min")
  })
})

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
