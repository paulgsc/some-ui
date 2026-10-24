import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import { narration, slidesFor, weeklyVerdict } from "@playoff-delta/lib/slides"
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

describe("the weekly emotional beat", () => {
  const week = SAMPLE_SEASON.weeks[0]!
  it.each([
    { before: [3], after: [2], headline: "Room to breathe.", tone: "hope" },
    { before: [2], after: [3], headline: "Less room to fall.", tone: "danger" },
    { before: [3], after: [3], headline: "Hope held on.", tone: "hope" },
    { before: [7], after: [null], headline: "The door shut.", tone: "over" },
    { before: [null], after: [null], headline: "Still out.", tone: "over" },
  ])("$headline follows the paths", ({ before, after, headline, tone }) => {
    const shown = {
      ...week,
      paths: { before, after, winsBefore: 5, winsAfter: 5 },
    }
    expect(weeklyVerdict(SAMPLE_SEASON, shown)).toEqual({ headline, tone })
    expect(narration(SAMPLE_SEASON, shown, "after")).toContain(headline)
    expect(narration(SAMPLE_SEASON, shown, "outro")).toBe(
      tone === "over"
        ? "The playoff paths end here."
        : "Hope survives. See you next week."
    )
  })
})
