/** @vitest-environment node */
import {
  boxesOf,
  frameAt,
  prepare,
  type BurnInFrame,
} from "@burn-ins/lib/burn-in"
import { GAME_CARD_TEMPLATES, pathSteps } from "@burn-ins/lib/game-card"
import { GAME_CARD_SAMPLES } from "@burn-ins/lib/samples"
import { PHASE_TITLES, SCENARIOS } from "@some-ui/game-scenarios"
import { describe, expect, it } from "vitest"

const card = (params: unknown): ReturnType<typeof prepare> =>
  prepare({ kind: "game-card", design: "gridiron-v1", params })

/** The card's frame, or the reasons it was refused. */
const drawn = (params: unknown): BurnInFrame & { kind: "game-card" } => {
  const p = card(params)
  if (!p.ok) throw new Error(p.problems.join("; "))
  const f = frameAt(p.value, 0)
  if (f.kind !== "game-card") throw new Error("not a game card")
  return f
}

const rows = (params: unknown): ReadonlyArray<string> =>
  drawn(params).frame.blocks.flatMap((b) => b.rows)

describe("a game card", () => {
  it("says the situation in the person's terms", () => {
    expect(rows(GAME_CARD_SAMPLES.stat)).toEqual([
      "SF · 4th quarter",
      "3rd and 8",
      "Down 4 · 1:52 left",
    ])
    expect(
      rows({
        template: "stat",
        team: "SEA",
        down: 1,
        toGo: "goal",
        margin: 0,
        quarter: "OT",
        left: "10:00",
      })
    ).toEqual(["SEA · Overtime", "1st and goal", "Tied · 10:00 left"])
  })

  it("puts the visitors over the home team, the leader's points in yellow", () => {
    const f = drawn(GAME_CARD_SAMPLES.score).frame
    expect(f.blocks.map((b) => b.rows.join(" "))).toEqual([
      "4th quarter · 1:52 left",
      "SF",
      "17",
      "SEA",
      "21",
    ])
    const colour = (text: string): string | undefined =>
      f.blocks.find((b) => b.rows[0] === text)?.style.colour
    expect(colour("21")).toBe("#ffd60a")
    expect(colour("17")).toBe("#ffffff")
    expect(
      rows({
        template: "score",
        away: { team: "SF", points: 20 },
        home: { team: "LAR", points: 20 },
        when: "final",
      })[0]
    ).toBe("Final")
  })

  it("takes a scenario's name, phase, outcome and icon from the catalog", () => {
    const scenario = SCENARIOS.find((s) => s.id === "in.third-long")
    if (!scenario) throw new Error("no third and long")
    const f = drawn(GAME_CARD_SAMPLES.scenario).frame
    expect(f.blocks.flatMap((b) => b.rows)).toEqual([
      PHASE_TITLES[scenario.phase],
      scenario.name,
      scenario.outcomes.find((o) => o.slug === "converted")?.label,
    ])
    expect(f.glyphs.map((g) => g.paths)).toEqual([scenario.icon])
  })

  it("draws a chain's steps in order, an arrow between each", () => {
    const f = drawn(GAME_CARD_SAMPLES.chain).frame
    // Each step's words in one block, on as many rows as they take.
    expect(f.blocks.map((b) => b.rows.join(" "))).toEqual([
      "One drive, start to finish",
      "Third and long",
      "Converted",
      "Red zone",
      "Touchdown",
      "SF lead the division with two weeks left",
    ])
    const tops = f.blocks.map((b) => b.box.y)
    expect([...tops].sort((a, b) => a - b)).toEqual(tops)
    // Two icons, a ring for the plain step, and two arrows.
    expect(f.glyphs).toHaveLength(5)
  })

  it("lists each number of wins that reaches a better seed", () => {
    expect(pathSteps([null, 7, 6, 6, 5, 2])).toEqual([
      { wins: 1, seed: 7 },
      { wins: 2, seed: 6 },
      { wins: 4, seed: 5 },
      { wins: 5, seed: 2 },
    ])
    expect(rows(GAME_CARD_SAMPLES.path)).toEqual([
      "Playoff Delta · week 15",
      "How SF gets in",
      "Win 1 more",
      "as high as the 7th seed",
      "Win 2 more",
      "as high as the 6th seed",
      "Win 3 more",
      "as high as the 5th seed",
      "Win 4 more",
      "as high as the 2nd seed",
    ])
    expect(
      rows({ template: "path", team: "NYJ", week: 12, paths: [null, null] })
    ).toEqual([
      "Playoff Delta · week 12",
      "How NYJ gets in",
      "No way in is left",
    ])
    expect(
      rows({ template: "path", team: "KC", week: 16, paths: [1] }).slice(2)
    ).toEqual(["Lose out", "as high as the 1st seed"])
  })

  it("draws a panel only as tall as its words, at the body's top", () => {
    for (const t of GAME_CARD_TEMPLATES) {
      const f = drawn(GAME_CARD_SAMPLES[t])
      const [panel] = f.frame.panels
      if (!panel) throw new Error(t)
      const panels = f.frame.panels.map((p) => p.box)
      const foot = Math.max(
        ...boxesOf(f)
          .filter((b) => !panels.includes(b))
          .map((b) => b.y + b.height)
      )
      expect(panel.box.y + panel.box.height - foot, t).toBe(48)
    }
  })

  it("refuses a scenario or an outcome the catalog doesn't have", () => {
    expect(
      card({ template: "scenario", scenario: "in.hail-mary" })
    ).toMatchObject({ ok: false })
    expect(
      card({ template: "scenario", scenario: "in.kick", outcome: "doinked" })
    ).toEqual({
      ok: false,
      problems: [
        'the game-card burn-in (gridiron-v1): Kick has no outcome "doinked"',
      ],
    })
    expect(
      card({
        template: "chain",
        steps: [
          { scenario: "in.kick", outcome: "made" },
          { scenario: "in.sack", outcome: "fumble" },
        ],
      })
    ).toEqual({
      ok: false,
      problems: [
        'the game-card burn-in (gridiron-v1): the 2nd step: Sack has no outcome "fumble"',
      ],
    })
  })

  it("draws every scenario in the catalog, with and without each outcome", () => {
    for (const s of SCENARIOS) {
      const bare = rows({ template: "scenario", scenario: s.id })
      expect(bare, s.id).toEqual([PHASE_TITLES[s.phase], ...bare.slice(1)])
      expect(bare.slice(1).join(" "), s.id).toBe(s.name)
      for (const o of s.outcomes) {
        const outcome = { scenario: s.id, outcome: o.slug }
        expect(card({ template: "scenario", ...outcome }).ok, o.slug).toBe(true)
        expect(
          card({ template: "chain", steps: [outcome, outcome] }).ok,
          `${s.id} ${o.slug} in a chain`
        ).toBe(true)
      }
    }
  })

  it("refuses a chain step that is blank, or both a scenario and words", () => {
    for (const step of [
      { text: "   " },
      { scenario: "in.kick", outcome: "made", text: "Good from 50" },
    ]) {
      expect(
        card({ template: "chain", steps: [{ text: "First" }, step] }).ok,
        JSON.stringify(step)
      ).toBe(false)
    }
  })

  it("refuses a score with one team on both sides", () => {
    expect(
      card({
        ...GAME_CARD_SAMPLES.score,
        home: { team: "SF", points: 3 },
      }).ok
    ).toBe(false)
  })

  it("refuses a team or a clock it can't read", () => {
    const stat = GAME_CARD_SAMPLES.stat
    for (const bad of [
      { ...stat, team: "49ers" },
      { ...stat, left: "1:75" },
      { ...stat, left: "16:00" },
    ]) {
      expect(card(bad).ok, JSON.stringify(bad)).toBe(false)
    }
  })

  it("refuses words that don't fit rather than cutting them", () => {
    const long = Array.from({ length: 30 }, () => "word").join(" ")
    expect(
      card({
        template: "chain",
        steps: [{ text: "First" }, { text: long }],
      })
    ).toEqual({
      ok: false,
      problems: [
        "the game-card burn-in (gridiron-v1): the 2nd step doesn't fit",
      ],
    })
    expect(
      card({
        template: "chain",
        kicker: long,
        steps: [{ text: "First" }, { text: "Then" }],
      })
    ).toEqual({
      ok: false,
      problems: [
        "the game-card burn-in (gridiron-v1): the chain's kicker doesn't fit",
      ],
    })
  })
})
