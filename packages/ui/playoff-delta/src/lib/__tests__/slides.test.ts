import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import { narration, slidesFor } from "@playoff-delta/lib/slides"
import { describe, expect, it } from "vitest"

describe("the story", () => {
  it("skips collisions only in a week that has none", () => {
    for (const w of SAMPLE_SEASON.weeks) {
      expect(slidesFor(w).includes("collisions")).toBe(w.collisions.length > 0)
    }
  })

  it("says what the paths say", () => {
    const w = SAMPLE_SEASON.weeks.find((x) => x.week === 9)
    if (!w) throw new Error("no week 9")
    expect(narration(SAMPLE_SEASON, w, "after")).toContain("never win again")
  })
})
