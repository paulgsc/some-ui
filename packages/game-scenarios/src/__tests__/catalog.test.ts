import { CATALOG, parseCatalog } from "@game-scenarios/catalog"
import { PRIMITIVES } from "@game-scenarios/icons"
import { SCENARIOS } from "@game-scenarios/scenarios"
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

describe("parseCatalog", () => {
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
      parseCatalog({ version: 1, scenarios: [{ ...entry, phase: "halftime" }] })
    ).toThrow("unknown phase in in.x: halftime")
    expect(() =>
      parseCatalog({ version: 1, scenarios: [{ ...entry, moment: "timeout" }] })
    ).toThrow("unknown moment in in.x: timeout")
  })
})
