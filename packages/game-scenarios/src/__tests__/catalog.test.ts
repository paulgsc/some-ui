import { CATALOG, CATALOG_VERSION, parseCatalog } from "@game-scenarios/catalog"
import { ICONS } from "@game-scenarios/icons"
import {
  isScenarioId,
  scenarioById,
  SCENARIOS,
} from "@game-scenarios/scenarios"
import { OUTCOME_WORDS } from "@game-scenarios/words"
import { describe, expect, it } from "vitest"

const sorted = (xs: Iterable<string>): Array<string> => [...xs].sort()

describe("the copy and the words agree (GW24)", () => {
  it("has words and an icon for every id, and none for an id it lacks", () => {
    const ids = CATALOG.scenarios.map((s) => s.id)
    expect(sorted(Object.keys(OUTCOME_WORDS))).toEqual(sorted(ids))
    expect(sorted(Object.keys(ICONS))).toEqual(sorted(ids))
  })

  it("labels every outcome, and no outcome the copy lacks", () => {
    for (const s of CATALOG.scenarios) {
      if (!isScenarioId(s.id)) throw new Error(`no words for ${s.id}`)
      expect(sorted(Object.keys(OUTCOME_WORDS[s.id])), s.id).toEqual(
        sorted(s.outcomes)
      )
    }
  })

  it("joins every scenario, in the catalog's order", () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual(
      CATALOG.scenarios.map((s) => s.id)
    )
    expect(scenarioById("in.third-long")?.outcomes).toEqual([
      { slug: "converted", label: "Converted" },
      { slug: "stopped", label: "Stopped" },
    ])
    expect(scenarioById("in.nothing")).toBeUndefined()
  })

  it("carries the version the server dumped", () => {
    expect(CATALOG_VERSION).toBe(1)
  })
})

describe("icons", () => {
  it("draws every icon from at least one path", () => {
    for (const s of SCENARIOS) expect(s.icon.length, s.id).toBeGreaterThan(0)
  })

  it("draws for-us and against-us with the same primitive in every icon", () => {
    const icon = (id: string): ReadonlyArray<string> =>
      scenarioById(id)?.icon ?? []
    const up = "M15.5 11.5L19 8l3.5 3.5"
    const down = "M15.5 17.5L19 21l3.5-3.5"
    expect(icon("you.caught-it")).toContain(up)
    expect(icon("you.missed-it")).toContain(up)
    expect(icon("you.sat-through")).toContain(down)
    expect(icon("you.dodged-it")).toContain(down)
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
