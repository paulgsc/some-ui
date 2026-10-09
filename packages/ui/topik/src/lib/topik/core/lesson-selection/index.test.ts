import type { SurveyReport } from "@topik/lib/topik/core/lesson-survey"
import { describe, expect, it } from "vitest"

import { heldLevel, topikLevelOf } from "."

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
