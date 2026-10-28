import {
  exitWeek,
  followed,
  hindsight,
  hindsightLine,
  seasonSpreads,
  SETTLED,
  verdictOf,
} from "@playoff-delta/lib/luck"
import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import { narration } from "@playoff-delta/lib/slides"
import type { StoryWeek } from "@playoff-delta/lib/story"
import { describe, expect, it } from "vitest"

const week = (n: number): StoryWeek => {
  const w = SAMPLE_SEASON.weeks.find((x) => x.week === n)
  if (!w) throw new Error(`no week ${n}`)
  return w
}

describe("verdictOf", () => {
  const shaped = (over: Partial<StoryWeek>, after = 0.5): StoryWeek => ({
    ...week(2),
    clinched: false,
    ...over,
    share: { ...week(2).share, after },
  })

  it("watches while the share is open", () => {
    expect(verdictOf(shaped({}, 0.5))).toEqual({ kind: "watch" })
    expect(verdictOf(shaped({}, 1 - SETTLED - 0.001)).kind).toBe("watch")
  })

  it("exits, and says why", () => {
    expect(verdictOf(shaped({ clinched: true }, 1))).toEqual({
      kind: "exit",
      why: "clinched",
    })
    const out = { ...week(2).paths, after: [null, null] }
    expect(verdictOf(shaped({ paths: out }, 0))).toEqual({
      kind: "exit",
      why: "out",
    })
    expect(verdictOf(shaped({}, 1 - SETTLED))).toEqual({
      kind: "exit",
      why: "settled-in",
    })
    expect(verdictOf(shaped({}, SETTLED))).toEqual({
      kind: "exit",
      why: "settled-out",
    })
  })
})

describe("the series on the bundled 2025 season", () => {
  // 2025: SF's share passed 98% after week 15 (98.6%), and SF got in.
  it("ends at the first exit, and follows no week past it", () => {
    const stopped = exitWeek(SAMPLE_SEASON)
    expect(stopped).toBe(15)
    expect(followed(SAMPLE_SEASON, week(9)).map((w) => w.week)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ])
    expect(followed(SAMPLE_SEASON, week(18)).at(-1)?.week).toBe(15)
  })

  it("says the series is over only from the exit week on", () => {
    expect(narration(SAMPLE_SEASON, week(9), "outro")).toMatch(
      /Next week, we drive again\.$/
    )
    expect(narration(SAMPLE_SEASON, week(15), "outro")).toMatch(
      /That's the series/
    )
  })

  it("adds weeks' luck as a fair game's: their variances add", () => {
    const two = [week(2), week(3)].map((w, i) => ({
      ...w,
      share: {
        ...w.share,
        league: [0.03, 0.04][i] ?? 0,
        spread: [0.03, 0.04][i] ?? 0,
      },
    }))
    // (0.03 + 0.04) / √(0.03² + 0.04²) = 0.07 / 0.05
    expect(seasonSpreads(two)).toBeCloseTo(1.4, 12)
    expect(seasonSpreads([])).toBeNull()
  })

  it("checks the exit in hindsight once the season is over", () => {
    const h = hindsight(SAMPLE_SEASON)
    expect(h).toMatchObject({ stopped: 15, reason: "settled-in", gotIn: true })
    if (!h) throw new Error("no hindsight")
    expect(hindsightLine(h)).toBe(
      "We got in. Nothing after week 15 changed it."
    )
    expect(hindsightLine({ ...h, gotIn: false })).toBe(
      "We missed. The 1.4% of ways out left after week 15 is what happened."
    )
  })
})
