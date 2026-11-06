import {
  checkNarration,
  dueWeeks,
  fillFile,
  NARRATION_SCHEMA,
  packetOf,
  SAID_MAX,
  type Narration,
  type Packet,
} from "@playoff-delta/lib/narration"
import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import { factsOf, formatOf } from "@playoff-delta/lib/show"
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
import { sha256Hex } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

import raw2026 from "./season-2026.json"

const SEASON_2026 = parseStorySeason(raw2026)
async function packet(season: StorySeason, week: number): Promise<Packet> {
  const made = await packetOf(season, week)
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

async function refusalsOf(
  season: StorySeason,
  week: number,
  data: unknown
): Promise<ReadonlyArray<string>> {
  const checked = await checkNarration(season, week, data)
  return checked.ok ? [] : checked.problems
}

const episodes = (season: StorySeason): ReadonlyArray<number> => [
  LEGEND_WEEK,
  ...season.weeks.map((w) => w.week),
]

describe("the packet", () => {
  it("pins the week's episode and asks for its format's scenes", async () => {
    const p = await packet(SAMPLE_SEASON, 9)
    expect(p.pins).toEqual({
      schema: NARRATION_SCHEMA,
      season: SAMPLE_SEASON.label,
      team: SAMPLE_SEASON.team,
      week: 9,
      format: { id: formatOf("week").id, version: formatOf("week").version },
      sha256: await sha256Hex(seasonData(seasonTo(SAMPLE_SEASON, 9))),
    })
    expect(p.scenes.map((s) => s.id)).toEqual(WEEK_SLIDES)
  })

  it("asks for the legend's scenes in week 0, with no words taught beside them", async () => {
    const p = await packet(SAMPLE_SEASON, LEGEND_WEEK)
    expect(p.pins.format.id).toBe(formatOf("legend").id)
    expect(p.scenes.map((s) => s.id)).toEqual(LEGEND_SLIDES)
    expect(p.words).toEqual([])
  })

  it("has no week the season hasn't played", async () => {
    expect(await packetOf(SAMPLE_SEASON, 99)).toEqual({
      ok: false,
      problems: ["the season has no week 99"],
    })
  })
})

const fill = factsSaid(await packet(SAMPLE_SEASON, 9))

describe("the check", () => {
  it.each([
    ["2025", SAMPLE_SEASON],
    ["2026", SEASON_2026],
  ] as const)(
    "takes the facts said as they are, every %s episode",
    async (_, season) => {
      for (const week of episodes(season)) {
        const fill = factsSaid(await packet(season, week))
        expect([week, await refusalsOf(season, week, fill)]).toEqual([week, []])
      }
    }
  )

  const refuses = (data: unknown): Promise<ReadonlyArray<string>> =>
    refusalsOf(SAMPLE_SEASON, 9, data)

  it("refuses what isn't the schema's shape", async () => {
    expect(
      await refuses(saying(fill, "ladder", "x".repeat(SAID_MAX + 1)))
    ).toEqual([
      `scenes.4.said: Too big: expected string to have <=${SAID_MAX} characters`,
    ])
  })

  it("refuses another episode's pins", async () => {
    expect(await refuses({ ...fill, sha256: "b".repeat(64) })).toEqual([
      `sha256 is ${"b".repeat(64)}, not this episode's ${fill.sha256}`,
    ])
    expect(await refuses({ ...fill, week: 8 })).toEqual([
      "week is 8, not this episode's 9",
    ])
    expect(
      await refuses({
        ...fill,
        format: { id: "playoff-delta-week", version: 2 },
      })
    ).toEqual([
      "the format is playoff-delta-week v2, not playoff-delta-week v1",
    ])
  })

  it("refuses scenes other than the format's, in its order", async () => {
    const [first, second, ...rest] = fill.scenes
    if (!first || !second) throw new Error("too few scenes")
    expect(
      await refuses({ ...fill, scenes: [second, first, ...rest] })
    ).toEqual([
      `the scenes are ${[second.id, first.id, ...rest.map((s) => s.id)].join(", ")}, not the format's ${WEEK_SLIDES.join(", ")}`,
    ])
  })

  it("refuses a forecast, and not a word that only starts like one", async () => {
    expect(
      await refuses(
        saying(fill, "ladder", "We are likely to win the division.")
      )
    ).toEqual(['ladder forecasts: "likely"'])
    expect(
      await refuses(saying(fill, "ladder", "Rivals with a shared lead."))
    ).toEqual([])
  })

  it("refuses a number the scene's facts don't give, however it's said", async () => {
    // Week 9's division: the floor 7 from 6, the ceiling 15, 6 to 14 wins.
    const division = (said: string): Promise<ReadonlyArray<string>> =>
      refuses(saying(fill, "division", said))
    expect(await division("The floor is seven, the ceiling 15.")).toEqual([])
    expect(await division("The ceiling is 16.")).toEqual([
      "division says 16, which its facts don't give",
    ])
    expect(await division("Twenty-one wins.")).toEqual([
      "division says 21, which its facts don't give",
    ])
    expect(await division("Seven and a half.")).toEqual([
      "division says 7.5, which its facts don't give",
    ])
    expect(await division("Seven, and 7 and a half.")).toEqual([
      "division says 7.5, which its facts don't give",
    ])
    expect(await division("Seeds 5, 16 wins.")).toEqual([
      "division says 16, which its facts don't give",
    ])
    expect(await division("A one-and-a-half win floor.")).toEqual([
      "division says 1.5, which its facts don't give",
    ])
    expect(await division("The floor is one and a half.")).toEqual([
      "division says 1.5, which its facts don't give",
    ])
    expect(await division("From 15½ down.")).toEqual([
      "division says 15.5, which its facts don't give",
    ])
  })

  it("counts no team name, seed, ordinal, lone one or the season's label", async () => {
    const season: StorySeason = {
      ...SAMPLE_SEASON,
      names: { ...SAMPLE_SEASON.names, SF: "49ers" },
    }
    const named = factsSaid(await packet(season, 9))
    expect(
      await refusalsOf(
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

  it("takes a week played by now, and refuses one that isn't", async () => {
    const season = (said: string): Promise<ReadonlyArray<string>> =>
      refuses(saying(fill, "season", said))
    expect(
      await season("Since week one, weeks 3 to 5, and week nine.")
    ).toEqual([])
    expect(await season("Come week 10.")).toEqual([
      "season says week 10, which isn't played yet",
    ])
    expect(
      await refuses(
        saying(fill, "division", "In weeks eight and fifteen, it held.")
      )
    ).toEqual(["division says week 15, which isn't played yet"])
    expect(
      await refuses(saying(fill, "division", "In the fifteenth week, it held."))
    ).toEqual(["division says week 15, which isn't played yet"])
    expect(
      await refuses(saying(fill, "outro", "One point five steps our way."))
    ).toEqual([])
    const legend = factsSaid(await packet(SAMPLE_SEASON, LEGEND_WEEK))
    expect(
      await refusalsOf(
        SAMPLE_SEASON,
        LEGEND_WEEK,
        saying(legend, "calls", "By week 3, you'll see.")
      )
    ).toEqual(["calls says week 3, and the legend names none"])
  })
})

describe("a week's facts", () => {
  it("read no later week, so a fill's pin holds as the season grows", () => {
    for (const week of episodes(SEASON_2026)) {
      expect([week, factsOf(seasonTo(SEASON_2026, week), week)]).toEqual([
        week,
        factsOf(SEASON_2026, week),
      ])
    }
  })
})

describe("the weeks due", () => {
  const newest = Math.max(...SEASON_2026.weeks.map((w) => w.week))
  const due = (filled: ReadonlyArray<number>): ReadonlyArray<number> =>
    dueWeeks(
      SEASON_2026,
      filled.map((w) => fillFile(SEASON_2026.team, w))
    )

  it("are the legend and the newest week on a first run, not the weeks before", () => {
    expect(due([])).toEqual([LEGEND_WEEK, newest])
  })

  it("are every week after the newest filled, and the legend until it is", () => {
    expect(due([LEGEND_WEEK, newest - 2])).toEqual([newest - 1, newest])
    expect(due([newest - 1])).toEqual([LEGEND_WEEK, newest])
    expect(due([LEGEND_WEEK, newest])).toEqual([])
  })

  it("ignore a file for a week the season doesn't have", () => {
    expect(due([LEGEND_WEEK, newest + 5])).toEqual([newest])
  })
})
