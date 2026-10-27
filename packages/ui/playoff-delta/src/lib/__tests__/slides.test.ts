import { verdictOf } from "@playoff-delta/lib/luck"
import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import { narration, slidesFor } from "@playoff-delta/lib/slides"
import { percent, points, type StoryWeek } from "@playoff-delta/lib/story"
import { describe, expect, it } from "vitest"

const week = (n: number): StoryWeek => {
  const w = SAMPLE_SEASON.weeks.find((x) => x.week === n)
  if (!w) throw new Error(`no week ${n}`)
  return w
}

describe("the story", () => {
  it("skips next week's slide only once no game is left", () => {
    const last = SAMPLE_SEASON.weeks.at(-1)
    if (!last) throw new Error("no weeks")
    expect(slidesFor(week(2))).toContain("stake")
    expect(last.stake).toBeNull()
    expect(slidesFor(last)).not.toContain("stake")
  })

  it("says what the luck and the verdict say", () => {
    for (const w of SAMPLE_SEASON.weeks) {
      if (w.share.spread > 0)
        expect(narration(SAMPLE_SEASON, w, "luck")).toContain(
          points(w.share.league)
        )
    }
    const watching = SAMPLE_SEASON.weeks.find(
      (w) => verdictOf(w).kind === "watch"
    )
    if (!watching) throw new Error("the bundled season is never followed")
    expect(narration(SAMPLE_SEASON, watching, "verdict")).toContain(
      percent(watching.share.after)
    )
  })

  it("has a bye, and says so", () => {
    const bye = SAMPLE_SEASON.weeks.find((w) => w.game === null)
    if (!bye) throw new Error("the bundled season has no bye")
    expect(narration(SAMPLE_SEASON, bye, "lights")).toContain("bye")
  })
})
