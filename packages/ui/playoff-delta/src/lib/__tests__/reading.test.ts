import {
  callOf,
  cleanRun,
  costs,
  kindOf,
  leagueBand,
  ownPart,
  sentence,
  weekBand,
  woke,
} from "@playoff-delta/lib/reading"
import type { StoryWeek } from "@playoff-delta/lib/story"
import { describe, expect, it } from "vitest"

import { SEASON7, WEEK7 } from "./week7"

describe("week 7, read in the vocabulary", () => {
  it("says the whole week in one sentence", () => {
    expect(sentence(SEASON7, WEEK7)).toBe(
      "All reds. We missed our light; the league ran mostly red. Our loss woke four minors; we made one. Traffic next week, and we have a bye. Keep driving."
    )
  })

  it("splits the road at our light, and the drops add up to the gap", () => {
    const c = costs(WEEK7)
    expect(c.own).toBeCloseTo(0.0292, 10)
    expect(c.own + c.league).toBeCloseTo(
      WEEK7.ways.best - WEEK7.ways.actual,
      10
    )
    expect(c.drops.reduce((a, b) => a + b, 0)).toBeCloseTo(
      WEEK7.ways.best - WEEK7.ways.actual,
      10
    )
  })

  it("reads the bands and the pieces our loss woke", () => {
    expect(weekBand(WEEK7)).toBe("all-reds")
    expect(leagueBand(WEEK7)).toBe("mostly-red")
    expect(ownPart(WEEK7)).toBe("missed")
    expect(woke(WEEK7).map((p) => [p.game.want, p.made])).toEqual([
      ["NE", false],
      ["DEN", true],
      ["LV", false],
      ["KC", false],
    ])
    expect(cleanRun(WEEK7)).toBe(false)
  })
})

describe("our part", () => {
  const without = (over: Partial<StoryWeek>): StoryWeek => ({
    ...WEEK7,
    ...over,
  })

  it("is a bye with no game, and a tie with a game none of the ways hold", () => {
    expect(ownPart(without({ game: null }))).toBe("bye")
    const ways = {
      ...WEEK7.ways,
      games: WEEK7.ways.games.filter((g) => g.kind !== "own"),
    }
    expect(ownPart(without({ ways }))).toBe("tie")
  })

  it("is idle when our light can't move us", () => {
    const ways = {
      ...WEEK7.ways,
      games: WEEK7.ways.games.map((g) =>
        g.kind === "own" ? { ...g, price: 0 } : g
      ),
    }
    expect(ownPart(without({ ways }))).toBe("idle")
  })

  it("wakes nothing on a bye, and the league's band is the whole week's", () => {
    const bye = without({ game: null, ways: { ...WEEK7.ways, given: null } })
    expect(woke(bye)).toEqual([])
    expect(leagueBand(bye)).toBe(weekBand(bye))
  })

  it("earns a clean run with no major or minor piece missed", () => {
    const ways = {
      ...WEEK7.ways,
      games: WEEK7.ways.games.map((g) => ({ ...g, winner: g.want })),
    }
    expect(cleanRun(without({ ways }))).toBe(true)
  })
})

describe("the call", () => {
  it("is a policy while watching or settled, a proof once clinched or out", () => {
    expect(callOf(WEEK7)).toBe("keep-driving")
    expect(callOf({ ...WEEK7, clinched: true })).toBe("arrived")
    expect(callOf({ ...WEEK7, share: { ...WEEK7.share, after: 0.99 } })).toBe(
      "park-it"
    )
    expect(
      callOf({
        ...WEEK7,
        paths: { ...WEEK7.paths, after: [null, null] },
        share: { ...WEEK7.share, after: 0 },
      })
    ).toBe("dead-end")
  })
})

describe("next week's pieces", () => {
  it("are named by who plays", () => {
    expect(kindOf(SEASON7, "SF", "SEA")).toBe("own")
    expect(kindOf(SEASON7, "PHI", "DAL")).toBe("inside")
    expect(kindOf(SEASON7, "KC", "SEA")).toBe("exported")
  })
})
