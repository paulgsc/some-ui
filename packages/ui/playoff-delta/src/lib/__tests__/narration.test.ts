import { createHash } from "node:crypto"
import {
  checkNarration,
  dueWeeks,
  NARRATION_SCHEMA,
  packetOf,
  SAID_MAX,
  type Narration,
  type Packet,
} from "@playoff-delta/lib/narration"
import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import { formatOf } from "@playoff-delta/lib/show"
import {
  LEGEND_SLIDES,
  LEGEND_WEEK,
  WEEK_SLIDES,
} from "@playoff-delta/lib/slides"
import {
  parseStorySeason,
  seasonData,
  seasonTo,
  type StorySeason,
} from "@playoff-delta/lib/story"
import { describe, expect, it } from "vitest"

import raw2026 from "./season-2026.json"

const SEASON_2026 = parseStorySeason(raw2026)
const sumOf = (data: string): string =>
  createHash("sha256").update(data).digest("hex")

function packet(season: StorySeason, week: number): Packet {
  const made = packetOf(season, week, sumOf)
  if (!made.ok) throw new Error(made.problems.join("; "))
  return made.value
}

/** A fill that says each scene's point and facts as they are written. */
const factsSaid = (p: Packet): Narration => ({
  ...p.pins,
  scenes: p.scenes.map((s) => ({
    id: s.id,
    said: [s.point, ...s.facts].join(" "),
  })),
})

/** `fill` with scene `id` saying `said` instead. */
const saying = (fill: Narration, id: string, said: string): Narration => ({
  ...fill,
  scenes: fill.scenes.map((s) => (s.id === id ? { id, said } : s)),
})

const refusalsOf = (
  season: StorySeason,
  week: number,
  data: unknown
): ReadonlyArray<string> => {
  const checked = checkNarration(season, week, sumOf, data)
  return checked.ok ? [] : checked.problems
}

const episodes = (season: StorySeason): ReadonlyArray<number> => [
  LEGEND_WEEK,
  ...season.weeks.map((w) => w.week),
]

describe("the packet", () => {
  it("pins the week's episode and asks for its format's scenes", () => {
    const p = packet(SAMPLE_SEASON, 9)
    expect(p.pins).toEqual({
      schema: NARRATION_SCHEMA,
      season: SAMPLE_SEASON.label,
      team: SAMPLE_SEASON.team,
      week: 9,
      format: { id: formatOf("week").id, version: formatOf("week").version },
      sha256: sumOf(seasonData(seasonTo(SAMPLE_SEASON, 9))),
    })
    expect(p.scenes.map((s) => s.id)).toEqual(WEEK_SLIDES)
  })

  it("asks for the legend's scenes in week 0, with no words taught beside them", () => {
    const p = packet(SAMPLE_SEASON, LEGEND_WEEK)
    expect(p.pins.format.id).toBe(formatOf("legend").id)
    expect(p.scenes.map((s) => s.id)).toEqual(LEGEND_SLIDES)
    expect(p.words).toEqual([])
  })

  it("has no week the season hasn't played", () => {
    expect(packetOf(SAMPLE_SEASON, 99, sumOf)).toEqual({
      ok: false,
      problems: ["the season has no week 99"],
    })
  })
})

describe("the check", () => {
  it.each([
    ["2025", SAMPLE_SEASON],
    ["2026", SEASON_2026],
  ] as const)(
    "takes the facts said as they are, every %s episode",
    (_, season) => {
      for (const week of episodes(season)) {
        const fill = factsSaid(packet(season, week))
        expect([week, refusalsOf(season, week, fill)]).toEqual([week, []])
      }
    }
  )

  const fill = factsSaid(packet(SAMPLE_SEASON, 9))
  const refuses = (data: unknown): ReadonlyArray<string> =>
    refusalsOf(SAMPLE_SEASON, 9, data)

  it("refuses what isn't the schema's shape", () => {
    expect(refuses(saying(fill, "ladder", "x".repeat(SAID_MAX + 1)))).toEqual([
      `scenes.4.said: Too big: expected string to have <=${SAID_MAX} characters`,
    ])
  })

  it("refuses another episode's pins", () => {
    expect(refuses({ ...fill, sha256: "b".repeat(64) })).toEqual([
      `sha256 is ${"b".repeat(64)}, not this episode's ${fill.sha256}`,
    ])
    expect(refuses({ ...fill, week: 8 })).toEqual([
      "week is 8, not this episode's 9",
    ])
    expect(
      refuses({ ...fill, format: { id: "playoff-delta-week", version: 2 } })
    ).toEqual([
      "the format is playoff-delta-week v2, not playoff-delta-week v1",
    ])
  })

  it("refuses scenes other than the format's, in its order", () => {
    const [first, second, ...rest] = fill.scenes
    if (!first || !second) throw new Error("too few scenes")
    expect(refuses({ ...fill, scenes: [second, first, ...rest] })).toEqual([
      `the scenes are ${[second.id, first.id, ...rest.map((s) => s.id)].join(", ")}, not the format's ${WEEK_SLIDES.join(", ")}`,
    ])
  })

  it("refuses a forecast, and not a word that only starts like one", () => {
    expect(
      refuses(saying(fill, "ladder", "We are likely to win the division."))
    ).toEqual(['ladder forecasts: "likely"'])
    expect(
      refuses(saying(fill, "ladder", "Rivals with a shared lead."))
    ).toEqual([])
  })

  it("refuses a number the scene's facts don't give, however it's said", () => {
    // Week 9's division: the floor 7 from 6, the ceiling 15, 6 to 14 wins.
    const division = (said: string): ReadonlyArray<string> =>
      refuses(saying(fill, "division", said))
    expect(division("The floor is seven, the ceiling 15.")).toEqual([])
    expect(division("The ceiling is 16.")).toEqual([
      "division says 16, which its facts don't give",
    ])
    expect(division("Twenty-one wins.")).toEqual([
      "division says 21, which its facts don't give",
    ])
    expect(division("Seven and a half.")).toEqual([
      "division says 7.5, which its facts don't give",
    ])
    expect(division("Seven, and 7 and a half.")).toEqual([
      "division says 7.5, which its facts don't give",
    ])
    expect(division("Seeds 5, 16 wins.")).toEqual([
      "division says 16, which its facts don't give",
    ])
    expect(division("A one-and-a-half win floor.")).toEqual([
      "division says 1.5, which its facts don't give",
    ])
    expect(division("The floor is one and a half.")).toEqual([
      "division says 1.5, which its facts don't give",
    ])
    expect(division("From 15½ down.")).toEqual([
      "division says 15.5, which its facts don't give",
    ])
  })

  it("counts no team name, seed, ordinal, lone one or the season's label", () => {
    const season: StorySeason = {
      ...SAMPLE_SEASON,
      names: { ...SAMPLE_SEASON.names, SF: "49ers" },
    }
    const named = factsSaid(packet(season, 9))
    expect(
      refusalsOf(
        season,
        9,
        saying(
          named,
          "ladder",
          "First, the 49ers in 2025: the #2 seed, seeds 5 to 7 or seeds five to seven, one of them, a one-way, the twenty-first, the twenty first, eleventh."
        )
      )
    ).toEqual([])
  })

  it("takes a week played by now, and refuses one that isn't", () => {
    const season = (said: string): ReadonlyArray<string> =>
      refuses(saying(fill, "season", said))
    expect(season("Since week one, weeks 3 to 5, and week nine.")).toEqual([])
    expect(season("Come week 10.")).toEqual([
      "season says week 10, which isn't played yet",
    ])
    expect(
      refuses(saying(fill, "division", "In weeks eight and fifteen, it held."))
    ).toEqual(["division says week 15, which isn't played yet"])
    expect(
      refuses(saying(fill, "division", "In the fifteenth week, it held."))
    ).toEqual(["division says week 15, which isn't played yet"])
    expect(
      refuses(saying(fill, "outro", "One point five steps our way."))
    ).toEqual([])
    const legend = factsSaid(packet(SAMPLE_SEASON, LEGEND_WEEK))
    expect(
      refusalsOf(
        SAMPLE_SEASON,
        LEGEND_WEEK,
        saying(legend, "calls", "By week 3, you'll see.")
      )
    ).toEqual(["calls says week 3, and the legend names none"])
  })
})

describe("a fill's pin", () => {
  it("still holds once later weeks land, in every week of the season", () => {
    for (const week of episodes(SEASON_2026)) {
      const written = factsSaid(packet(seasonTo(SEASON_2026, week), week))
      expect([week, refusalsOf(SEASON_2026, week, written)]).toEqual([week, []])
    }
  })

  it("moves when a week it reads changes", () => {
    const [first, ...rest] = SEASON_2026.weeks
    if (!first) throw new Error("the season has no weeks")
    const changed: StorySeason = {
      ...SEASON_2026,
      weeks: [{ ...first, pending: { ...first.pending, after: -1 } }, ...rest],
    }
    for (const week of episodes(SEASON_2026)) {
      const written = factsSaid(packet(SEASON_2026, week))
      expect(refusalsOf(changed, week, written)).toEqual([
        `sha256 is ${written.sha256}, not this episode's ${sumOf(seasonData(seasonTo(changed, week)))}`,
      ])
    }
  })
})

describe("the weeks due", () => {
  const newest = SEASON_2026.weeks.at(-1)?.week ?? 0
  const due = (filled: ReadonlyArray<number>): ReadonlyArray<number> =>
    dueWeeks(SEASON_2026, new Set(filled))

  it("are the legend and the newest week on a first run, not the weeks before", () => {
    expect(due([])).toEqual([LEGEND_WEEK, newest])
  })

  it("are every week after the newest filled, and the legend until it is", () => {
    expect(due([LEGEND_WEEK, newest - 2])).toEqual([newest - 1, newest])
    expect(due([newest - 1])).toEqual([LEGEND_WEEK, newest])
    expect(due([LEGEND_WEEK, newest])).toEqual([])
  })
})
