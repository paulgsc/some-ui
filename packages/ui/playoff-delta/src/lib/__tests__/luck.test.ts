import {
  exitLine,
  exitWeek,
  followed,
  hindsight,
  hindsightLine,
  inSpreads,
  lightsOf,
  LUCK_DEFINED,
  LUCK_WORDS,
  luckBand,
  seasonSpreads,
  SETTLED,
  verdictOf,
  type ExitReason,
} from "@playoff-delta/lib/luck"
import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import { narration, slidesFor } from "@playoff-delta/lib/slides"
import type { StoryResult, StoryWeek } from "@playoff-delta/lib/story"
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
  ...over,
})

describe("lightsOf", () => {
  it("puts the team's own result first, then the league's that moved it", () => {
    const lights = lightsOf({
      ...week(2),
      results: [
        result({ leverage: -0.03 }),
        result({ kind: "own", winner: "SF", loser: "NO", leverage: 0.09 }),
        result({ winner: "LAR", loser: "ARI", leverage: 0.0001 }),
      ],
    })
    expect(lights.map((l) => [l.result.winner, l.made])).toEqual([
      ["SF", true],
      ["PHI", false],
    ])
  })
})

describe("luckBand", () => {
  it.each([
    [null, "still"],
    [0, "usual"],
    [0.49, "usual"],
    [-0.49, "usual"],
    [0.5, "lucky"],
    [-0.5, "unlucky"],
    [1.5, "very lucky"],
    [-2.9, "very unlucky"],
  ] as const)("%s spreads: %s", (spreads, band) => {
    expect(luckBand(spreads)).toBe(band)
  })

  it("signs spreads after rounding", () => {
    expect(inSpreads(1.24)).toBe("+1.2")
    expect(inSpreads(-0.4)).toBe("−0.4")
    expect(inSpreads(-0.01)).toBe("0.0")
  })
})

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
    expect(narration(SAMPLE_SEASON, week(9), "outro")).toBe(
      "Next week, we ask again."
    )
    expect(narration(SAMPLE_SEASON, week(15), "outro")).toMatch(
      /That's the series/
    )
  })

  it("adds weeks' luck as a fair game's: changes over the root of summed variances", () => {
    const weeks = followed(SAMPLE_SEASON, week(18))
    const change = weeks.reduce((s, w) => s + w.share.league, 0)
    const variance = weeks.reduce((s, w) => s + w.share.spread ** 2, 0)
    expect(seasonSpreads(weeks)).toBeCloseTo(change / Math.sqrt(variance), 12)
    expect(seasonSpreads([])).toBeNull()
  })

  it("checks the exit in hindsight once the season is over", () => {
    const h = hindsight(SAMPLE_SEASON)
    expect(h).toMatchObject({ stopped: 15, reason: "settled-in", gotIn: true })
    if (!h) throw new Error("no hindsight")
    expect(hindsightLine(h)).toBe(
      "They got in. Nothing after week 15 changed it."
    )
    expect(hindsightLine({ ...h, gotIn: false })).toBe(
      "They missed. The 1.4% of ways out left after week 15 is what happened."
    )
  })
})

describe("the words", () => {
  const REASONS: ReadonlyArray<ExitReason> = [
    "clinched",
    "out",
    "settled-in",
    "settled-out",
  ]
  // Say what is counted (CLAUDE.md, "Say what it is"): never odds.
  const FORECAST = /\b(chance|odds|likely|probability)\b/i

  it("count ways, and never forecast", () => {
    const lines = [
      LUCK_DEFINED,
      ...Object.values(LUCK_WORDS).flatMap((w) => [w.big, w.line]),
      ...REASONS.map(exitLine),
      ...SAMPLE_SEASON.weeks.flatMap((w) =>
        slidesFor(w).map((id) => narration(SAMPLE_SEASON, w, id))
      ),
    ]
    for (const line of lines) expect(line).not.toMatch(FORECAST)
  })
})
