import {
  BIG_PLAY_KINDS,
  BIG_PLAY_SIZES,
  CATALOG,
  CLAIM_SHAPES,
  CLAIM_SIDES,
  DEADLINES,
  HALVES,
  MEASURES,
  parseCatalog,
  UNITS,
  VERDICTS,
} from "@game-scenarios/catalog"
import { PRIMITIVES } from "@game-scenarios/icons"
import { isScenarioId, scenarioOf, SCENARIOS } from "@game-scenarios/scenarios"
import { OUTCOME_WORDS } from "@game-scenarios/words"
import { describe, expect, it } from "vitest"

// Importing `SCENARIOS` already fails on an id or outcome in the copy with no
// icon or words here; these hold the other direction.
describe("the copy and the words agree (GW24)", () => {
  it("has no words for an id the copy lacks", () => {
    expect(Object.keys(OUTCOME_WORDS).sort()).toEqual(
      CATALOG.scenarios.map((s) => s.id).sort()
    )
  })

  it("finds every scenario by its id", () => {
    for (const s of SCENARIOS) {
      if (!isScenarioId(s.id)) throw new Error(s.id)
      expect(scenarioOf(s.id)).toBe(s)
    }
  })

  it("labels no outcome the copy lacks", () => {
    for (const s of SCENARIOS) {
      const words: Readonly<Record<string, string>> = OUTCOME_WORDS[s.id]
      expect(Object.keys(words).sort(), s.id).toEqual(
        [...s.outcomes.map((o) => o.slug)].sort()
      )
    }
  })
})

describe("icons", () => {
  it("draws for-us and against-us with the same primitive in every icon", () => {
    const icon = (id: string): ReadonlyArray<string> =>
      SCENARIOS.find((s) => s.id === id)?.icon ?? []
    for (const id of ["you.caught-it", "you.missed-it"])
      expect(icon(id)).toEqual(expect.arrayContaining([...PRIMITIVES.FOR_US]))
    for (const id of ["you.sat-through", "you.dodged-it"])
      expect(icon(id)).toEqual(
        expect.arrayContaining([...PRIMITIVES.AGAINST_US])
      )
  })
})

describe("the dimensions a bite is read along (#3048)", () => {
  it("starts each size further out than the one before", () => {
    const yards = CATALOG.bigPlay.sizes.map((size) => size.yards)
    expect(yards).toEqual([...yards].sort((a, b) => a - b))
    expect(new Set(yards).size).toBe(yards.length)
  })
})

type RawClaims = Parameters<typeof parseCatalog>[0]["claims"]

describe("parseCatalog", () => {
  const claims: RawClaims = {
    measures: MEASURES.map((id) => ({ id, unit: "defense", better: "higher" })),
    shapes: CLAIM_SHAPES.map((id) => ({ id, sides: [...CLAIM_SIDES[id]] })),
    deadlines: [...DEADLINES],
    verdicts: [...VERDICTS],
  }
  const dimensions = {
    halves: [...HALVES],
    units: [...UNITS],
    big_play: {
      sizes: BIG_PLAY_SIZES.map((id, i) => ({ id, yards: 20 * (i + 1) })),
      kinds: BIG_PLAY_KINDS.map((id) => ({ id, least: "big" })),
    },
    claims,
  }

  it("refuses a measure, shape, side, deadline or verdict this code does not know, or one it lacks", () => {
    const with_ = (change: Partial<typeof claims>): void => {
      parseCatalog({
        version: 3,
        scenarios: [],
        ...dimensions,
        claims: { ...claims, ...change },
      })
    }
    expect(() => with_({})).not.toThrow()
    expect(() => with_({ measures: claims.measures.slice(1) })).toThrow(
      /^measure: third-down/
    )
    expect(() =>
      with_({
        measures: claims.measures.map((m) => ({ ...m, unit: "bench" })),
      })
    ).toThrow("unknown unit of pass-rush: bench")
    expect(() =>
      with_({
        measures: claims.measures.map((m) => ({ ...m, better: "more" })),
      })
    ).toThrow("unknown better of pass-rush: more")
    expect(() =>
      with_({
        shapes: claims.shapes.map((shape) =>
          shape.id === "trend" ? { id: "trend", sides: ["up", "down"] } : shape
        ),
      })
    ).toThrow("unknown sides of trend: up")
    expect(() => with_({ shapes: claims.shapes.slice(1) })).toThrow(
      /^claim shape: vs-league/
    )
    expect(() =>
      with_({
        shapes: claims.shapes.map((shape) =>
          shape.id === "rank"
            ? { id: "rank", sides: ["lowest", "highest"] }
            : shape
        ),
      })
    ).toThrow("sides of rank: lowest, highest is not highest, lowest")
    expect(() => with_({ deadlines: ["by-week", "season-end"] })).toThrow(
      "deadline: by-week, season-end is not after-games, by-week, season-end"
    )
    expect(() =>
      with_({ verdicts: claims.verdicts.filter((v) => v !== "withdrawn") })
    ).toThrow(/^verdict: /)
  })

  it("refuses a half, size, kind or unit this code does not know, or one it lacks", () => {
    expect(() =>
      parseCatalog({
        version: 3,
        scenarios: [],
        ...dimensions,
        units: ["offense", "defense", "special-teams"],
      })
    ).toThrow("unit: offense, defense, special-teams is not")
    expect(() =>
      parseCatalog({
        version: 3,
        scenarios: [],
        ...dimensions,
        halves: ["first", "second"],
      })
    ).toThrow("half: first, second is not first, second, overtime")
    expect(() =>
      parseCatalog({
        version: 3,
        scenarios: [],
        ...dimensions,
        big_play: {
          ...dimensions.big_play,
          kinds: [{ id: "lateral", least: "big" }],
        },
      })
    ).toThrow("unknown big-play kind: lateral")
    expect(() =>
      parseCatalog({
        version: 3,
        scenarios: [],
        ...dimensions,
        big_play: {
          ...dimensions.big_play,
          kinds: BIG_PLAY_KINDS.map((id) => ({ id, least: "vast" })),
        },
      })
    ).toThrow("unknown least size of pass: vast")
    expect(() =>
      parseCatalog({
        version: 3,
        scenarios: [],
        ...dimensions,
        big_play: {
          ...dimensions.big_play,
          sizes: [...dimensions.big_play.sizes].reverse(),
        },
      })
    ).toThrow("big-play size: memorable, huge, big is not big, huge, memorable")
  })

  it("refuses a phase or moment this code does not know", () => {
    const entry = {
      id: "in.x",
      phase: "in",
      name: "X",
      covers: "X.",
      outcomes: ["a"],
      moment: "snap",
    }
    expect(() =>
      parseCatalog({
        version: 1,
        scenarios: [{ ...entry, phase: "halftime" }],
        ...dimensions,
      })
    ).toThrow("unknown phase in in.x: halftime")
    expect(() =>
      parseCatalog({
        version: 1,
        scenarios: [{ ...entry, moment: "timeout" }],
        ...dimensions,
      })
    ).toThrow("unknown moment in in.x: timeout")
  })
})
