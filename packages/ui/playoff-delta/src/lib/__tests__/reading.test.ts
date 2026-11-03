import {
  blocLine,
  callOf,
  cleanRun,
  greensOf,
  ladderLine,
  redsOf,
  rungOf,
  standingOf,
  stepsOf,
} from "@playoff-delta/lib/reading"
import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import type { PoleGroup, Poles, StoryWeek } from "@playoff-delta/lib/story"
import { describe, expect, it } from "vitest"

const group = (
  floor: number,
  lose: number,
  win: number,
  bloc: PoleGroup["bloc"] = { teams: ["LAR"], banked: floor, games: 0 }
): PoleGroup => ({ floor, bloc, ceiling: { lose, win, team: "LAR" } })

const poles = (
  us: readonly [number, number],
  division: PoleGroup,
  seeds: Poles["seeds"] = { best: 1, worst: null }
): Poles => ({
  us: { low: us[0], high: us[1] },
  division,
  conference: division,
  held: division.floor,
  seeds,
})

describe("an objective's standing", () => {
  it.each([
    // our low reaches the ceiling: clinched
    [[12, 14], group(9, 12, 11), "clinched"],
    // winning out reaches the ceiling with us winning out
    [[10, 14], group(9, 15, 14), "hands"],
    // winning out reaches the floor only
    [[10, 12], group(9, 15, 14), "help"],
    [[10, 12], group(13, 15, 14), "out"],
  ] as const)("%j against %j is %s", (us, g, standing) => {
    expect(standingOf(poles(us, g), "division")).toBe(standing)
  })

  it("counts down to it in whole steps", () => {
    const p = poles([10, 14], group(9, 15, 14))
    expect(greensOf(p, "division")).toBe(5)
    expect(redsOf(p, "division")).toBe(5)
    expect(greensOf(poles([12, 14], group(9, 12, 11)), "division")).toBe(0)
  })
})

describe("the ladder", () => {
  it.each([
    [1, "top"],
    [2, "division"],
    [4, "division"],
    [5, "wildcard"],
    [7, "wildcard"],
    [null, "out"],
  ] as const)("seed %s stands on %s", (seed, rung) => {
    expect(rungOf(seed)).toBe(rung)
  })

  const week = (seeds: Poles["seeds"]): StoryWeek => {
    const first = SAMPLE_SEASON.weeks[0]
    if (!first) throw new Error("no weeks")
    return {
      ...first,
      poles: { ...first.poles, after: { ...first.poles.after, seeds } },
    }
  }

  it("calls it open, arrived or a dead end", () => {
    expect(callOf(week({ best: 1, worst: null }))).toBe("keep-driving")
    expect(callOf(week({ best: 5, worst: 7 }))).toBe("arrived")
    expect(callOf(week({ best: 2, worst: 5 }))).toBe("keep-driving")
    expect(callOf(week({ best: null, worst: null }))).toBe("dead-end")
    expect(ladderLine(week({ best: 5, worst: 6 }).poles.after)).toBe(
      "A wild card, whatever happens."
    )
  })
})

describe("the floor's proof", () => {
  it("names a few rivals and counts many", () => {
    expect(
      blocLine(
        group(3, 17, 15, { teams: ["LAR", "SEA", "ARI"], banked: 2, games: 6 })
      )
    ).toBe(
      "LAR, SEA and ARI: 2 wins banked and 6 games left against each other. However those go, one of them reaches 3."
    )
    expect(
      blocLine(
        group(7, 17, 17, {
          teams: ["DAL", "WAS", "NYG", "DET", "GB"],
          banked: 20.5,
          games: 9,
        })
      )
    ).toMatch(/^five rivals: 20½ wins banked/)
    expect(blocLine(group(12, 14, 13))).toBe(
      "LAR has 12 wins already: the floor is 12."
    )
  })
})

describe("the bundled season", () => {
  it("has clean runs and weeks that are not", () => {
    const clean = SAMPLE_SEASON.weeks.filter(cleanRun)
    expect(clean.length).toBeGreaterThan(0)
    expect(clean.length).toBeLessThan(SAMPLE_SEASON.weeks.length)
  })

  it("closes the envelope by whole steps, and our own result is one of them", () => {
    for (const w of SAMPLE_SEASON.weeks) {
      const s = stepsOf(w, "division")
      expect(s.best).toBeGreaterThanOrEqual(w.game?.won ? 1 : 0)
      expect(s.worst).toBeGreaterThanOrEqual(w.game && !w.game.won ? 1 : 0)
    }
  })
})
