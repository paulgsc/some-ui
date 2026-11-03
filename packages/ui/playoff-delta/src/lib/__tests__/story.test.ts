import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import { steps, wins, type Poles } from "@playoff-delta/lib/story"
import { describe, expect, it } from "vitest"

/** A seed as a rung number, out last. */
const rung = (seed: number | null): number => seed ?? 8

describe("the contract", () => {
  it("chains each week's table to the next", () => {
    const weeks = SAMPLE_SEASON.weeks
    for (let i = 1; i < weeks.length; i++)
      expect(weeks[i]?.poles.before).toEqual(weeks[i - 1]?.poles.after)
  })

  it("only narrows the poles (PD4)", () => {
    for (const w of SAMPLE_SEASON.weeks) {
      const [b, a]: [Poles, Poles] = [w.poles.before, w.poles.after]
      for (const key of ["division", "conference"] as const) {
        expect(a[key].floor).toBeGreaterThanOrEqual(b[key].floor)
        expect(a[key].ceiling.lose).toBeLessThanOrEqual(b[key].ceiling.lose)
      }
      expect(a.us.low).toBeGreaterThanOrEqual(b.us.low)
      expect(a.us.high).toBeLessThanOrEqual(b.us.high)
      expect(rung(a.seeds.best)).toBeGreaterThanOrEqual(rung(b.seeds.best))
      expect(rung(a.seeds.worst)).toBeLessThanOrEqual(rung(b.seeds.worst))
    }
  })

  it("holds our division to two wins before a snap, and the conference to six", () => {
    const first = SAMPLE_SEASON.weeks[0]?.poles.before
    expect(first?.division.floor).toBe(2)
    expect(first?.division.bloc).toEqual({
      teams: ["LAR", "SEA", "ARI"],
      banked: 0,
      games: 6,
    })
    expect(first?.conference.floor).toBe(6)
  })
})

describe("wins as said", () => {
  it.each([
    [0, "0"],
    [0.5, "½"],
    [6, "6"],
    [6.5, "6½"],
  ] as const)("%s is %s", (x, said) => {
    expect(wins(x)).toBe(said)
  })

  it.each([
    [0, "0"],
    [1, "+1"],
    [-0.5, "−½"],
    [-2, "−2"],
  ] as const)("a change of %s is %s", (x, said) => {
    expect(steps(x)).toBe(said)
  })
})
