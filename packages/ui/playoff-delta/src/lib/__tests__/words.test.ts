import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import {
  LEGEND_SLIDES,
  legendLine,
  narration,
  slidesFor,
} from "@playoff-delta/lib/slides"
import {
  CALLS,
  CLEAN_RUN,
  COHORTS,
  COUNTDOWNS,
  numberWord,
  OBJECTIVES,
  PIECES,
  POLES,
  RUNGS,
  STANDINGS,
} from "@playoff-delta/lib/words"
import { describe, expect, it } from "vitest"

// Say what can happen (CLAUDE.md, "Say what it is"): never odds, and never
// the statistics the grammar retired.
const FORECAST =
  /\b(chance|odds|likely|probability|percent|share|spread|average|sample)/i
// State in the person's terms: no machinery reaches the screen.
const MACHINERY = /\b(flow|cut|null|undefined|NaN|PD\d|max|min)\b/

const words = (table: object): ReadonlyArray<string> =>
  Object.values(table).flatMap((v: unknown) =>
    typeof v === "string"
      ? [v]
      : typeof v === "object" && v !== null
        ? words(v)
        : []
  )

describe("the vocabulary", () => {
  const tables = {
    PIECES,
    POLES,
    COHORTS,
    CLEAN_RUN,
    OBJECTIVES,
    STANDINGS,
    COUNTDOWNS,
    RUNGS,
    CALLS,
  }

  it.each(Object.entries(tables))("%s says what can happen", (_, table) => {
    for (const w of words(table)) {
      expect(w).not.toMatch(FORECAST)
      expect(w).not.toMatch(MACHINERY)
    }
  })

  it("says every week and the legend in it", () => {
    const lines = [
      ...LEGEND_SLIDES.map((id) => legendLine(SAMPLE_SEASON, id)),
      ...SAMPLE_SEASON.weeks.flatMap((w) =>
        slidesFor().map((id) => narration(SAMPLE_SEASON, w, id))
      ),
    ]
    for (const line of lines) {
      expect(line).not.toBe("")
      expect(line).not.toMatch(FORECAST)
      expect(line).not.toMatch(MACHINERY)
    }
  })

  it("counts in words to ten", () => {
    expect(numberWord(0)).toBe("no")
    expect(numberWord(10)).toBe("ten")
    expect(numberWord(14)).toBe("14")
  })
})
