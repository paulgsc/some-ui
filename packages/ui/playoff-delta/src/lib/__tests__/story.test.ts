import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import {
  blewIt,
  cellChanges,
  claimOf,
  floorRecord,
  provenSign,
  weekVerdict,
  type StoryResult,
  type StoryWeek,
  type TemplateKey,
} from "@playoff-delta/lib/story"
import { describe, expect, it } from "vitest"

const week = (n: number): StoryWeek => {
  const w = SAMPLE_SEASON.weeks.find((x) => x.week === n)
  if (!w) throw new Error(`no week ${n}`)
  return w
}

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

/**
 * PDS1: the week's verdict names what the week did to the paths. Family: the
 * team's own result (won, lost), what the cells did (one closed, one opened,
 * both, neither), and whether a path is left before and after; the floor
 * lifting only by the team's own win is the "neither" row of a win.
 */
describe("weekVerdict (PDS1)", () => {
  type Paths = ReadonlyArray<number | null>
  const shaped = (
    won: boolean,
    before: Paths,
    winsBefore: number,
    after: Paths
  ): StoryWeek => {
    const w = week(9)
    return {
      ...w,
      game: { ...w.game, won },
      paths: {
        before: [...before],
        after: [...after],
        winsBefore,
        winsAfter: winsBefore + (won ? 1 : 0),
      },
    }
  }

  it.each([
    // A win that only lifts the banked floor (2026, week 6: 5-0 to 6-0).
    [true, [3, 3, 1, 1, 1], 5, [3, 1, 1, 1, 1], "Held."],
    [true, [null, 4, 3, 2, 1], 3, [4, 3, 2, 1, 1], "Held."],
    [false, [null, 4, 3, 2, 1], 3, [null, 4, 3, 2, 1], "Held."],
    [true, [null, 4, 3, 2, 1], 3, [null, null, 4, 2, 1], "Worse."],
    [false, [7, 5, 1, 1, 1], 6, [7, 5, 2, 1, 1], "Worse."],
    // Opening a path takes a tied game, which the grid can still show.
    [false, [null, 5], 6, [5, 5], "Better."],
    [true, [null, null, 5], 6, [5, 5], "Better."],
    [false, [null, 3], 6, [5, 4], "Worse."],
    [false, [null, 5], 6, [null, null], "Absorbed."],
    [true, [null, null], 6, [null, null], "Still out."],
  ] as const)(
    "won %s, %j at %i wins, then %j: %s",
    (won, before, wins, after, verdict) => {
      expect(weekVerdict(shaped(won, before, wins, after))).toBe(verdict)
    }
  )
})

/**
 * PDS2: a result's colour is what the data proves. Family: the template it
 * sits in, the engine's verdict (helped, hurt, none), the fan's reading
 * (true, false, none), and whether the game was against the other
 * conference.
 */
describe("provenSign (PDS2)", () => {
  const KEYS: ReadonlyArray<TemplateKey> = [
    "division",
    "rivals",
    "above",
    "exported",
    "spoilers",
    "forced",
  ]
  const empty = {
    division: [],
    rivals: [],
    above: [],
    exported: [],
    spoilers: [],
    forced: [],
  }

  it("is the engine's verdict, else conservation's sign, else nothing", () => {
    for (const k of KEYS)
      for (const moved of ["helped", "hurt", null] as const)
        for (const yourWay of [true, false, null])
          for (const outside of [true, false]) {
            if (k === "exported" && !outside) continue
            const r: StoryResult = {
              team: "PHI",
              opponent: "KC",
              won: false,
              yourWay,
              moved,
            }
            const w: StoryWeek = {
              ...week(9),
              templates: {
                ...empty,
                [k]: [r],
                ...(outside ? { exported: [r] } : {}),
              },
            }
            const expected =
              moved !== null ? moved === "helped" : outside ? yourWay : null
            expect(
              provenSign(w, r),
              JSON.stringify({ k, moved, yourWay, outside })
            ).toBe(expected)
          }
  })

  it("never paints a result against the engine's verdict in the bundled season", () => {
    for (const w of SAMPLE_SEASON.weeks)
      for (const r of Object.values(w.templates).flat())
        if (r.moved) expect(provenSign(w, r)).toBe(r.moved === "helped")
  })
})
