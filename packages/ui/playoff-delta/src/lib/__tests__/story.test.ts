import { lawOf } from "@playoff-delta/lib/laws"
import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import {
  blewIt,
  calls,
  cellChanges,
  claimOf,
  floorRecord,
  points,
  shareVerdict,
  type StoryResult,
  type StorySeason,
  type StoryWeek,
} from "@playoff-delta/lib/story"
import { describe, expect, it } from "vitest"

const week = (n: number): StoryWeek => {
  const w = SAMPLE_SEASON.weeks.find((x) => x.week === n)
  if (!w) throw new Error(`no week ${n}`)
  return w
}

const result = (over: Partial<StoryResult>): StoryResult => ({
  winner: "PHI",
  loser: "DET",
  kind: "inside",
  leverage: 0,
  moved: null,
  ...over,
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

describe("cellChanges", () => {
  const shaped = (
    game: StoryWeek["game"],
    before: Array<number | null>,
    after: Array<number | null>
  ): StoryWeek => ({
    ...week(2),
    game,
    paths: { ...week(2).paths, before, after },
  })
  const won = { opponent: "NO", won: true, relation: "conference" } as const

  it("shifts a row after a win: last week's +1 is this week's 0", () => {
    expect(cellChanges(shaped(won, [null, 6], [6]))[0]?.[5]).toBe("open")
  })

  it("does not shift on a bye", () => {
    // Shifted, row 0 would read last week's row 1, where #3 was open.
    expect(cellChanges(shaped(null, [6, 3], [6, 3]))[0]?.[2]).toBe("closed")
  })

  it("marks a closed path", () => {
    expect(cellChanges(shaped(null, [5], [6]))[0]?.[4]).toBe("pruned")
  })
})

describe("shareVerdict", () => {
  const shaped = (before: number, after: number, out = false): StoryWeek => ({
    ...week(2),
    paths: { ...week(2).paths, after: out ? [null] : [5] },
    share: { ...week(2).share, before, after },
  })

  it.each([
    [0.6, 0.7, "Better."],
    [0.7, 0.6, "Worse."],
    [0.6, 0.604, "Held."],
    [0.6, 0.596, "Held."],
  ] as const)("%f to %f: %s", (before, after, verdict) => {
    expect(shareVerdict(shaped(before, after))).toBe(verdict)
  })

  it("says the paths closed for good, whatever the share did", () => {
    expect(shareVerdict(shaped(0.01, 0, true))).toBe("Absorbed.")
  })
})

describe("points", () => {
  it("signs a change in share as points", () => {
    expect(points(0.093)).toBe("+9.3")
    expect(points(-0.029)).toBe("−2.9")
    expect(points(0.0002)).toBe("0.0")
  })
})

describe("lawOf", () => {
  const shaped = (
    game: StoryWeek["game"],
    results: Array<StoryResult>
  ): StoryWeek => ({ ...week(2), game, results })
  const g = week(2).game

  it("is the four kinds on a bye or a week with no league result", () => {
    expect(lawOf(shaped(null, [result({})]))).toBe("kinds")
    expect(lawOf(shaped(g, [result({ kind: "own", winner: "SF" })]))).toBe(
      "kinds"
    )
  })

  it("follows the league's biggest result", () => {
    const own = result({ kind: "own", winner: "SF", leverage: 0.2 })
    const exported = result({ kind: "exported", leverage: -0.03 })
    const inside = result({ kind: "inside", leverage: 0.01 })
    expect(lawOf(shaped(g, [own, exported, inside]))).toBe("conservation")
    expect(
      lawOf(shaped(g, [own, { ...inside, leverage: 0.04 }, exported]))
    ).toBe("room")
  })
})

describe("calls", () => {
  it("settles last week's calls this week's results decided", () => {
    const [a, b] = SAMPLE_SEASON.weeks
    if (!a || !b) throw new Error("two weeks")
    const season: StorySeason = {
      ...SAMPLE_SEASON,
      weeks: [
        {
          ...a,
          next: [
            { home: "TEN", away: "LAR", rootFor: "TEN", swing: 0.02 },
            { home: "NYG", away: "WAS", rootFor: "WAS", swing: 0.01 },
          ],
        },
        {
          ...b,
          results: [result({ winner: "LAR", loser: "TEN", leverage: -0.016 })],
        },
      ],
    }
    expect(calls(season, b).map((c) => c.result.winner)).toEqual(["LAR"])
    expect(calls(season, a)).toEqual([])
  })
})

describe("blewIt", () => {
  it("marks a loss from ahead", () => {
    expect(
      blewIt(result({ collapse: { peakWinProbability: 0.3, led: true } }))
    ).toBe(true)
    expect(
      blewIt(result({ collapse: { peakWinProbability: 0.7, led: false } }))
    ).toBe(true)
  })

  it("leaves a loss that was never close, or no data, alone", () => {
    expect(
      blewIt(result({ collapse: { peakWinProbability: 0.2, led: false } }))
    ).toBe(false)
    expect(blewIt(result({}))).toBe(false)
  })
})
