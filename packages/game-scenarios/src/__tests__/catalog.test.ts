import {
  BIG_PLAY_KINDS,
  BIG_PLAY_SIZES,
  CATALOG,
  HALVES,
  parseCatalog,
} from "@game-scenarios/catalog"
import { PRIMITIVES } from "@game-scenarios/icons"
import { isScenarioId, scenarioOf, SCENARIOS } from "@game-scenarios/scenarios"
import {
  BIG_PLAY_KIND_WORDS,
  BIG_PLAY_SIZE_WORDS,
  HALF_WORDS,
  OUTCOME_WORDS,
} from "@game-scenarios/words"
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
  it("names every half and every big play's size and kind, as the copy does", () => {
    expect(CATALOG.halves).toEqual(HALVES)
    expect(CATALOG.bigPlay.sizes.map((size) => size.id)).toEqual(BIG_PLAY_SIZES)
    expect(CATALOG.bigPlay.kinds.map((kind) => kind.id)).toEqual(BIG_PLAY_KINDS)
    for (const words of [HALF_WORDS, BIG_PLAY_SIZE_WORDS, BIG_PLAY_KIND_WORDS])
      for (const said of Object.values(words)) expect(said).not.toBe("")
  })

  it("starts each size further out than the one before", () => {
    const yards = CATALOG.bigPlay.sizes.map((size) => size.yards)
    expect(yards).toEqual([...yards].sort((a, b) => a - b))
    expect(new Set(yards).size).toBe(yards.length)
  })
})

describe("parseCatalog", () => {
  const dimensions = {
    halves: [...HALVES],
    big_play: {
      sizes: BIG_PLAY_SIZES.map((id, i) => ({ id, yards: 20 * (i + 1) })),
      kinds: BIG_PLAY_KINDS.map((id) => ({ id, least: "big" })),
    },
  }

  it("refuses a half, size or kind this code does not know, or one it lacks", () => {
    expect(() =>
      parseCatalog({
        version: 2,
        scenarios: [],
        ...dimensions,
        halves: ["first", "second"],
      })
    ).toThrow("half: first, second is not first, second, overtime")
    expect(() =>
      parseCatalog({
        version: 2,
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
        version: 2,
        scenarios: [],
        ...dimensions,
        big_play: {
          ...dimensions.big_play,
          kinds: BIG_PLAY_KINDS.map((id) => ({ id, least: "vast" })),
        },
      })
    ).toThrow("unknown least size of pass: vast")
    // Out of order, or one twice, is not the set.
    expect(() =>
      parseCatalog({
        version: 2,
        scenarios: [],
        ...dimensions,
        big_play: {
          ...dimensions.big_play,
          sizes: [...dimensions.big_play.sizes].reverse(),
        },
      })
    ).toThrow("big-play size: memorable, huge, big is not big, huge, memorable")
    expect(() =>
      parseCatalog({
        version: 2,
        scenarios: [],
        ...dimensions,
        halves: ["first", "first", "second", "overtime"],
      })
    ).toThrow("half: first, first, second, overtime is not")
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
