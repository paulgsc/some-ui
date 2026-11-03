import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import { legendFacts, WEEK_SLIDES, weekFacts } from "@playoff-delta/lib/slides"
import { describe, expect, it } from "vitest"

const week1 = SAMPLE_SEASON.weeks[0]
if (!week1) throw new Error("no weeks")

describe("what a take keeps", () => {
  it("opens on our division and closes on the week in one sentence", () => {
    expect(WEEK_SLIDES[0]).toBe("division")
    expect(WEEK_SLIDES.at(-1)).toBe("outro")
    expect(weekFacts(SAMPLE_SEASON, week1, "division")).toEqual([
      "The floor: 3, from 2.",
      "The ceiling: 17, held.",
      "LAR, SEA and ARI: 2 wins banked and 6 games left against each other. However those go, one of them reaches 3.",
      "LAR can still reach 17.",
      "We can finish with 1 to 17 wins.",
    ])
  })

  it("keeps the season's first table in the legend", () => {
    expect(legendFacts(SAMPLE_SEASON, "poles")).toContain(
      "Before a snap, the floor is 2 for our division and 6 for our conference, with the Niners going 17-0."
    )
  })

  it("keeps each objective's standing and its countdowns", () => {
    const [division, countdowns] = weekFacts(SAMPLE_SEASON, week1, "standings")
    expect(division).toMatch(/^The division: (in our hands|needs help)\.$/)
    expect(countdowns).toMatch(/^\d+½? greens? to go, \d+½? reds? to spare\.$/)
  })

  it("holds our range over a bye, and keeps it", () => {
    const bye = SAMPLE_SEASON.weeks.find((w) => w.game === null)
    if (!bye) throw new Error("the bundled season has no bye")
    expect(bye.poles.after.us).toEqual(bye.poles.before.us)
    expect(weekFacts(SAMPLE_SEASON, bye, "division").at(-1)).toMatch(
      /^We can finish with \d+ to \d+ wins\.$/
    )
    expect(weekFacts(SAMPLE_SEASON, bye, "outro")[0]).not.toMatch(
      /^A clean run/
    )
  })
})
