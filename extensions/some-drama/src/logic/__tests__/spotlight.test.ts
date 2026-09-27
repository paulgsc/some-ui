import {
  clockOf,
  spotlightView,
  verdictSpotlight,
} from "@drama/logic/content/spotlight"
import { describe, expect, it } from "vitest"

describe("verdictSpotlight", () => {
  const at = { rating: 7, completionLikelihood: 0.5 }

  it("is null when neither verdict moved", () => {
    expect(verdictSpotlight(at, { ...at })).toBeNull()
  })

  it("spotlights the verdict that moved, with its delta", () => {
    expect(verdictSpotlight(at, { ...at, rating: 7.5 })).toEqual({
      kind: "rating",
      value: 7.5,
      delta: 0.5,
    })
    expect(
      verdictSpotlight(at, { ...at, completionLikelihood: 0.4 })
    ).toMatchObject({ kind: "finish", value: 0.4 })
  })

  it("prefers the rating when both moved at once", () => {
    const both = { rating: 9, completionLikelihood: 0.9 }
    expect(verdictSpotlight(at, both)?.kind).toBe("rating")
  })
})

describe("spotlightView", () => {
  it("shows a beat's mood, how hard it hit, and where", () => {
    const view = spotlightView({
      kind: "mood",
      mood: "sadness",
      intensity: 2,
      videoTime: 725,
    })
    expect(view).toEqual({
      glyph: "😭",
      headline: "Sad",
      detail: "●●○ · at 12:05",
      tone: "sadness",
    })
  })

  it("leaves the time out when no source tab could say", () => {
    const view = spotlightView({
      kind: "mood",
      mood: "joy",
      intensity: 1,
      videoTime: null,
    })
    expect(view.detail).toBe("●○○")
  })

  it("shows which way a verdict moved", () => {
    const up = spotlightView({ kind: "rating", value: 8, delta: 0.5 })
    expect(up).toMatchObject({ headline: "8.0", tone: "rise" })
    expect(up.detail).toContain("▲ 0.5")

    const down = spotlightView({ kind: "finish", value: 0.3, delta: -0.1 })
    expect(down).toMatchObject({ headline: "Dropping?", tone: "fall" })
    expect(down.detail).toContain("30% to finish")
    expect(down.detail).toContain("▼ 10%")
  })
})

describe("clockOf", () => {
  it("is m:ss", () => {
    expect(clockOf(0)).toBe("0:00")
    expect(clockOf(3725.9)).toBe("62:05")
  })
})
