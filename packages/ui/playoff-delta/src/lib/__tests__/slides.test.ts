import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import { narration, slidesFor } from "@playoff-delta/lib/slides"
import { percent, type StoryWeek } from "@playoff-delta/lib/story"
import { describe, expect, it } from "vitest"

const week = (n: number): StoryWeek => {
  const w = SAMPLE_SEASON.weeks.find((x) => x.week === n)
  if (!w) throw new Error(`no week ${n}`)
  return w
}

describe("the story", () => {
  it("skips a slide only in a week with nothing for it", () => {
    // 2025: a boundary through week 8; in whatever happens from week 16, so
    // no league result is worth a point and no game next week matters.
    expect(slidesFor(week(2))).toEqual(
      expect.arrayContaining(["league", "boundary", "next"])
    )
    expect(slidesFor(week(12))).not.toContain("boundary")
    expect(slidesFor(week(17))).not.toContain("league")
    expect(slidesFor(week(17))).not.toContain("next")
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
