import {
  checkNarration,
  NARRATION_SCHEMA,
  NarrationSchema,
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
  weekFacts,
} from "@playoff-delta/lib/slides"
import { parseStorySeason, type StorySeason } from "@playoff-delta/lib/story"
import { describe, expect, it } from "vitest"

import raw2026 from "./season-2026.json"

const SEASON_2026 = parseStorySeason(raw2026)
const SHA = "a".repeat(64)

function packet(season: StorySeason, week: number): Packet {
  const made = packetOf(season, week, SHA)
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

const problemsOf = (
  season: StorySeason,
  week: number,
  data: unknown
): ReadonlyArray<string> => {
  const checked = checkNarration(season, week, SHA, data)
  return checked.ok ? [] : checked.problems
}

const episodes = (season: StorySeason): ReadonlyArray<number> => [
  LEGEND_WEEK,
  ...season.weeks.map((w) => w.week),
]

describe("the packet", () => {
  it("asks for the week's format's scenes, with the facts each slide shows", () => {
    const p = packet(SAMPLE_SEASON, 9)
    const week = SAMPLE_SEASON.weeks.find((w) => w.week === 9)
    if (!week) throw new Error("the sample has no week 9")
    expect(p.pins).toEqual({
      schema: NARRATION_SCHEMA,
      season: SAMPLE_SEASON.label,
      team: SAMPLE_SEASON.team,
      week: 9,
      format: { id: formatOf("week").id, version: formatOf("week").version },
      sha256: SHA,
    })
    expect(p.scenes.map((s) => s.id)).toEqual(WEEK_SLIDES)
    expect(p.scenes.map((s) => s.facts)).toEqual(
      WEEK_SLIDES.map((id) => weekFacts(SAMPLE_SEASON, week, id))
    )
  })

  it("asks for the legend's scenes in week 0", () => {
    const p = packet(SAMPLE_SEASON, LEGEND_WEEK)
    expect(p.pins.format.id).toBe(formatOf("legend").id)
    expect(p.scenes.map((s) => s.id)).toEqual(LEGEND_SLIDES)
  })

  it("has no week the season hasn't played", () => {
    expect(packetOf(SAMPLE_SEASON, 99, SHA)).toEqual({
      ok: false,
      problems: ["the season has no week 99"],
    })
  })

  it("gives the shape back as JSON Schema", () => {
    expect(packet(SAMPLE_SEASON, 9).jsonSchema).toMatchObject({
      properties: { schema: { const: NARRATION_SCHEMA } },
      additionalProperties: false,
    })
  })

  it("says the forecast words a fill may not use", () => {
    const guidance = packet(SAMPLE_SEASON, 9).guidance.join(" ")
    expect(guidance).toMatch(/no chance, odds/)
  })
})

describe("the check", () => {
  // The scene's own facts are a fill the check takes, in every episode of
  // both seasons: it refuses no number the show itself says.
  it.each([
    ["2025", SAMPLE_SEASON],
    ["2026", SEASON_2026],
  ] as const)(
    "takes the facts said as they are, every %s episode",
    (_, season) => {
      for (const week of episodes(season)) {
        const fill = factsSaid(packet(season, week))
        expect([week, problemsOf(season, week, fill)]).toEqual([week, []])
      }
    }
  )

  const fill = factsSaid(packet(SAMPLE_SEASON, 9))
  const refuses = (data: unknown): ReadonlyArray<string> =>
    problemsOf(SAMPLE_SEASON, 9, data)

  it("refuses what isn't the schema's shape", () => {
    expect(refuses({ ...fill, scenes: [] }).length).toBeGreaterThan(0)
    expect(refuses({ ...fill, extra: 1 }).length).toBeGreaterThan(0)
    expect(
      refuses(saying(fill, "ladder", "x".repeat(SAID_MAX + 1))).length
    ).toBeGreaterThan(0)
  })

  it("refuses another episode's pins", () => {
    expect(refuses({ ...fill, sha256: "b".repeat(64) })).toEqual([
      `sha256 is ${"b".repeat(64)}, not this episode's ${SHA}`,
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
    expect(refuses({ ...fill, scenes: rest }).length).toBe(1)
  })

  it("refuses a forecast", () => {
    expect(
      refuses(saying(fill, "ladder", "We are likely to win the division."))
    ).toEqual(['ladder forecasts: "likely"'])
  })

  it("refuses a number the scene's facts don't give, however it's said", () => {
    // Week 9's division: the floor 7 from 6, the ceiling 15, 6 to 14 wins.
    expect(
      refuses(saying(fill, "division", "The floor is 7, the ceiling 15."))
    ).toEqual([])
    expect(refuses(saying(fill, "division", "The ceiling is 16."))).toEqual([
      "division says 16, which its facts don't give",
    ])
    expect(refuses(saying(fill, "division", "Sixteen wins."))).toEqual([
      "division says 16, which its facts don't give",
    ])
    expect(refuses(saying(fill, "division", "Seven and a half."))).toEqual([
      "division says 7.5, which its facts don't give",
    ])
    expect(refuses(saying(fill, "division", "From 15½ down."))).toEqual([
      "division says 15.5, which its facts don't give",
    ])
  })

  it("counts no team name, seed or the season's label as a number", () => {
    const season: StorySeason = {
      ...SAMPLE_SEASON,
      names: { ...SAMPLE_SEASON.names, SF: "49ers" },
    }
    const named = factsSaid(packet(season, 9))
    const said = (text: string): ReadonlyArray<string> =>
      problemsOf(season, 9, saying(named, "ladder", text))
    expect(said("The 49ers in 2025: the #1 seed, or seeds 5 to 7.")).toEqual([])
  })

  it("takes a week played by now, and refuses one that isn't", () => {
    expect(
      refuses(saying(fill, "season", "Since week 3, and week nine."))
    ).toEqual([])
    expect(refuses(saying(fill, "season", "Come week 10."))).toEqual([
      "season says week 10, which isn't played yet",
    ])
  })

  it("parses the same fill the schema does", () => {
    expect(NarrationSchema.safeParse(fill).success).toBe(true)
  })
})
