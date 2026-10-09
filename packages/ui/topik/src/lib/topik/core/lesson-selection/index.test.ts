import type { SurveyReport } from "@topik/lib/topik/core/lesson-survey"
import { describe, expect, it } from "vitest"

import { heldLevel, normalizeRelation, probeRelations, topikLevelOf } from "."

const report = (partial: Partial<SurveyReport>): SurveyReport => ({
  topikKey: "played",
  at: 1,
  stuck: [],
  ...partial,
})

describe("the level the learner holds", () => {
  it("comes from the last report that names one, else 1", () => {
    expect(heldLevel([report({}), report({ level: 4 })])).toBe(4)
    expect(heldLevel([report({})])).toBe(1)
    expect(heldLevel([])).toBe(1)
  })

  it("reads a level tag and nothing else", () => {
    expect(topikLevelOf(["makjang", "topik-5"])).toBe(5)
    expect(topikLevelOf(["topik-7", "topik-"])).toBeUndefined()
  })
})

describe("probeRelations", () => {
  it("lists every relation a choice probe's options stand in, never the gloss", () => {
    expect(
      probeRelations({
        id: "p",
        kind: "odd-one-out",
        order: 2,
        prompt: "?",
        options: [
          { text: "a", relation: "Past", valid: true, why: "" },
          { text: "b", relation: "past", valid: true, why: "" },
          { text: "c", relation: "gloss", valid: false, why: "" },
          { text: "d", relation: "negation", valid: false, why: "" },
        ],
      })
    ).toEqual(["past", "negation"])
    expect(normalizeRelation("  Reason   connective ")).toBe(
      "reason connective"
    )
  })
})
