import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import { legendLine, narration, slidesFor } from "@playoff-delta/lib/slides"
import { describe, expect, it } from "vitest"

const week1 = SAMPLE_SEASON.weeks[0]
if (!week1) throw new Error("no weeks")

describe("the story", () => {
  it("opens on our division and closes on the week in one sentence", () => {
    expect(slidesFor()[0]).toBe("division")
    expect(slidesFor().at(-1)).toBe("outro")
    expect(narration(SAMPLE_SEASON, week1, "division")).toBe(
      "Week 1. Our division. The floor rose from 2 to 3; the ceiling held at 17. LAR, SEA and ARI: 2 wins banked and 6 games left against each other. However those go, one of them reaches 3. LAR can still reach 17. We can finish with 1 to 17."
    )
  })

  it("says the season's first table in the legend", () => {
    expect(legendLine(SAMPLE_SEASON, "poles")).toContain(
      "Before a snap, the floor is 2 for our division and 6 for our conference, with the Niners going 17-0."
    )
  })

  it("says each objective's standing and its countdowns", () => {
    expect(narration(SAMPLE_SEASON, week1, "standings")).toMatch(
      /^The division, (in our hands|needs help): \d+½? greens to go, \d+½? reds to spare\./
    )
  })

  it("has a bye, and still reads its week", () => {
    const bye = SAMPLE_SEASON.weeks.find((w) => w.game === null)
    if (!bye) throw new Error("the bundled season has no bye")
    expect(narration(SAMPLE_SEASON, bye, "division")).toContain(
      `Week ${bye.week}.`
    )
  })
})
