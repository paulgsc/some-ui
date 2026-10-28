import { verdictOf } from "@playoff-delta/lib/luck"
import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import { narration, slidesFor } from "@playoff-delta/lib/slides"
import { percent, type StoryWeek } from "@playoff-delta/lib/story"
import { describe, expect, it } from "vitest"

import { SEASON7, WEEK7 } from "./week7"

describe("the story", () => {
  it("skips next week's slide only once no game is left", () => {
    const last = SAMPLE_SEASON.weeks.at(-1)
    if (!last) throw new Error("no weeks")
    expect(slidesFor(WEEK7)).toContain("stake")
    expect(last.stake).toBeNull()
    expect(slidesFor(last)).not.toContain("stake")
  })

  it("opens on the best week and closes on the week in one sentence", () => {
    expect(slidesFor(WEEK7)[0]).toBe("best")
    expect(narration(SEASON7, WEEK7, "best")).toBe(
      "Week 7. The best week we could have had: 99.3% of the ways in. It needed our light (a major)."
    )
    expect(narration(SEASON7, WEEK7, "road")).toBe(
      "Kickoff by kickoff, the best week still possible went from 99.3% to 94.0%. Our light cost 2.9 points. The league cost 2.3."
    )
    expect(narration(SEASON7, WEEK7, "outro")).toMatch(/^All reds\. /)
  })

  it("says what the verdict says", () => {
    const watching = SAMPLE_SEASON.weeks.find(
      (w) => verdictOf(w).kind === "watch"
    )
    if (!watching) throw new Error("the bundled season is never followed")
    expect(narration(SAMPLE_SEASON, watching, "verdict")).toContain(
      percent(watching.share.after)
    )
  })

  it("has a bye, and says the week was the league's", () => {
    const bye = SAMPLE_SEASON.weeks.find((w) => w.game === null)
    if (!bye) throw new Error("the bundled season has no bye")
    expect(narration(SAMPLE_SEASON, bye, "given")).toMatch(
      /^With no result of ours/
    )
  })

  it("places us on the podium, or says why not", () => {
    const unplaced: StoryWeek = {
      ...WEEK7,
      podium: { ...WEEK7.podium, place: null },
    }
    expect(narration(SEASON7, WEEK7, "podium")).toBe(
      "Gold, JAX: better than 95 of every 100 of its ways. SF came 30th of 31."
    )
    expect(narration(SEASON7, unplaced, "podium")).toMatch(
      /SF wasn't placed: its week couldn't move it a point\./
    )
  })
})
