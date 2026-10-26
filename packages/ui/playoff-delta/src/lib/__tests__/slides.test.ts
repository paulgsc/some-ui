import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import { narration, slidesFor } from "@playoff-delta/lib/slides"
import { leagueResults, percent } from "@playoff-delta/lib/story"
import { describe, expect, it } from "vitest"

describe("the story", () => {
  it("skips a slide only in a week with nothing for it", () => {
    for (const w of SAMPLE_SEASON.weeks) {
      const ids = slidesFor(w)
      expect(ids.includes("collisions")).toBe(w.collisions.length > 0)
      expect(ids.includes("boundary")).toBe(w.boundary !== null)
      expect(ids.includes("next")).toBe(w.next.length > 0)
      expect(ids.includes("league")).toBe(leagueResults(w).length > 0)
    }
  })

  it("says what the share says", () => {
    for (const w of SAMPLE_SEASON.weeks) {
      const line = narration(SAMPLE_SEASON, w, "after")
      expect(line).toContain(percent(w.share.before))
      expect(line).toContain(percent(w.share.after))
    }
  })

  it("has a bye, and says so", () => {
    const bye = SAMPLE_SEASON.weeks.find((w) => w.game === null)
    if (!bye) throw new Error("the bundled season has no bye")
    expect(narration(SAMPLE_SEASON, bye, "game")).toContain("bye")
  })
})
