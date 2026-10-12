import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import {
  blewIt,
  cellChanges,
  claimOf,
  floorKey,
  floorRecord,
  parseStorySeason,
  type StoryResult,
  type StoryWeek,
} from "@playoff-delta/lib/story"
import { describe, expect, it } from "vitest"

const week = (n: number): StoryWeek => {
  const w = SAMPLE_SEASON.weeks.find((x) => x.week === n)
  if (!w) throw new Error(`no week ${n}`)
  return w
}

describe("the contract", () => {
  it("parses the sample season", () => {
    expect(SAMPLE_SEASON.weeks).toHaveLength(17)
  })

  it("refuses a feed that breaks it", () => {
    expect(() => parseStorySeason({ ...SAMPLE_SEASON, version: 2 })).toThrow()
    expect(() => parseStorySeason({ ...SAMPLE_SEASON, weeks: [] })).toThrow()
  })
})

describe("claimOf", () => {
  it("is the first row with a way in", () => {
    expect(claimOf([null, 6, 2], 5)).toEqual({
      in: true,
      wins: 5,
      extraWins: 1,
      seed: 6,
    })
  })

  it("is out when no row has one", () => {
    expect(claimOf([null, null], 7)).toEqual({ in: false, wins: 7 })
  })

  it("reads 'never win again' as zero more wins", () => {
    const c = claimOf([6, 3], 6)
    expect(c.in && c.extraWins).toBe(0)
    expect(floorRecord(c, 17)).toBe("6–11")
  })
})

describe("floorKey", () => {
  it("orders fewer total wins first, then the better seed", () => {
    const a = claimOf([5], 6)
    const b = claimOf([null, 2], 6)
    const out = claimOf([null], 6)
    expect(floorKey(a)).toBeLessThan(floorKey(b))
    expect(floorKey(b)).toBeLessThan(floorKey(out))
  })
})

describe("cellChanges", () => {
  it("shifts a row after a win: last week's +1 is this week's 0", () => {
    const w = week(9)
    expect(w.game.won).toBe(true)
    const zeroRow = cellChanges(w)[0]
    // #6 and #7 were open with one more win, and stay open with none.
    expect(zeroRow?.[5]).toBe("open")
    expect(zeroRow?.[6]).toBe("open")
  })

  it("closes every path in the week that absorbs", () => {
    const changes = cellChanges(week(16)).flat()
    expect(changes.some((c) => c === "pruned")).toBe(true)
    expect(changes.every((c) => c === "pruned" || c === "closed")).toBe(true)
  })
})

describe("blewIt", () => {
  const base: StoryResult = {
    team: "SEA",
    opponent: "ARI",
    won: false,
    yourWay: true,
    moved: null,
  }

  it("marks a loss from ahead", () => {
    expect(
      blewIt({ ...base, collapse: { peakWinProbability: 0.3, led: true } })
    ).toBe(true)
    expect(
      blewIt({ ...base, collapse: { peakWinProbability: 0.7, led: false } })
    ).toBe(true)
  })

  it("leaves a loss that was never close, a win, or no data alone", () => {
    expect(
      blewIt({ ...base, collapse: { peakWinProbability: 0.2, led: false } })
    ).toBe(false)
    expect(
      blewIt({
        ...base,
        won: true,
        collapse: { peakWinProbability: 0.9, led: true },
      })
    ).toBe(false)
    expect(blewIt(base)).toBe(false)
  })
})
