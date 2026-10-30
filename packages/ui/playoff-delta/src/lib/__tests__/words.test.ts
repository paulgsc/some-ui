import { exitLine, hindsight, hindsightLine } from "@playoff-delta/lib/luck"
import { sentence } from "@playoff-delta/lib/reading"
import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import {
  LEGEND_SLIDES,
  legendLine,
  narration,
  slidesFor,
} from "@playoff-delta/lib/slides"
import {
  bandOf,
  BANDS,
  CALLS,
  MATERIAL,
  materialOf,
  numberWord,
  PIECES,
  STAKES,
  stakesOf,
  VERBS,
  widthOf,
} from "@playoff-delta/lib/words"
import { describe, expect, it } from "vitest"

describe("material", () => {
  it.each([
    [0.01, 0, "major"],
    [0.0099, 0, "minor"],
    [0.0025, 0, "minor"],
    [0.0024, 0, "idle"],
    [0.004, 0.004, "idle"],
    [0.02, 0.03, "idle"],
  ] as const)("%s ± %s is %s", (price, error, material) => {
    expect(materialOf({ price, error })).toBe(material)
  })
})

describe("the week's bands", () => {
  it.each([
    [1, "all-greens"],
    [0.9, "all-greens"],
    [0.89, "mostly-green"],
    [0.65, "mostly-green"],
    [0.5, "stop-and-go"],
    [0.35, "stop-and-go"],
    [0.34, "mostly-red"],
    [0.1, "mostly-red"],
    [0.06, "all-reds"],
    [0, "all-reds"],
  ] as const)("a rank of %s is %s", (rank, band) => {
    expect(bandOf(rank)).toBe(band)
  })

  it("have fixed widths that cover every week", () => {
    expect(BANDS.map((b) => widthOf(b.band))).toEqual([10, 25, 30, 25, 10])
  })
})

describe("next week's stakes", () => {
  it.each([
    [0.08, "rush-hour"],
    [0.05, "rush-hour"],
    [0.0499, "traffic"],
    [0.01, "traffic"],
    [0.0099, "empty-road"],
  ] as const)("a spread of %s is %s", (spread, stakes) => {
    expect(stakesOf(spread)).toBe(stakes)
  })
})

describe("counting words", () => {
  it("spells small numbers", () => {
    expect([0, 1, 4, 10, 11].map(numberWord)).toEqual([
      "no",
      "one",
      "four",
      "ten",
      "11",
    ])
  })
})

describe("every word the short says", () => {
  // Say what is counted (CLAUDE.md, "Say what it is"): never odds.
  const FORECAST = /\b(chance|odds|likely|probability)\b/i

  it("counts ways, and never forecasts", () => {
    const h = hindsight(SAMPLE_SEASON)
    const lines = [
      ...Object.values(PIECES).flatMap((p) => [p.noun, p.who, p.moves]),
      ...Object.values(MATERIAL).flatMap((m) => [m.word, m.worth]),
      ...Object.values(VERBS).flatMap((v) => [v.word, v.means]),
      ...BANDS.map((b) => b.phrase),
      ...Object.values(STAKES).flatMap((s) => [s.phrase, s.means]),
      ...Object.values(CALLS).flatMap((c) => [c.phrase, c.means]),
      ...(["clinched", "out", "settled-in", "settled-out"] as const).map(
        exitLine
      ),
      ...(h ? [hindsightLine(h)] : []),
      ...LEGEND_SLIDES.map(legendLine),
      ...SAMPLE_SEASON.weeks.flatMap((w) => [
        sentence(SAMPLE_SEASON, w),
        ...slidesFor(w).map((id) => narration(SAMPLE_SEASON, w, id)),
      ]),
    ]
    for (const line of lines) expect(line).not.toMatch(FORECAST)
  })
})
