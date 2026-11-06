import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import { uploadOf } from "@playoff-delta/lib/show"
import {
  LEGEND_SLIDES,
  legendFacts,
  SCENES,
  WEEK_SLIDES,
  weekFacts,
} from "@playoff-delta/lib/slides"
import { parseStorySeason } from "@playoff-delta/lib/story"
import {
  CALLS,
  CLEAN_RUN,
  COHORTS,
  COUNTDOWNS,
  FORECAST,
  numberWord,
  OBJECTIVES,
  PIECES,
  POLES,
  RUNGS,
  STANDINGS,
} from "@playoff-delta/lib/words"
import { describe, expect, it } from "vitest"

import raw2026 from "./season-2026.json"

const SEASON_2026 = parseStorySeason(raw2026)

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

  it("says every scene, every week of both seasons and the legend in it", () => {
    const lines = [
      ...Object.values(SCENES).flatMap((scene) => [scene.name, scene.point]),
      ...LEGEND_SLIDES.flatMap((id) => legendFacts(SAMPLE_SEASON, id)),
      ...[SAMPLE_SEASON, SEASON_2026].flatMap((season) =>
        season.weeks.flatMap((w) =>
          WEEK_SLIDES.flatMap((id) => weekFacts(season, w, id))
        )
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

describe("the upload's copy (SH5)", () => {
  const copies = [SAMPLE_SEASON, SEASON_2026].flatMap((season) => [
    { at: `${season.label}, the legend`, copy: uploadOf(season, null) },
    ...season.weeks.map((w) => ({
      at: `${season.label} week ${w.week}`,
      copy: uploadOf(season, w),
    })),
  ])

  it.each(copies)("says what can happen in $at", ({ copy }) => {
    for (const line of [copy.title, copy.description]) {
      expect(line).not.toMatch(FORECAST)
      expect(line).not.toMatch(MACHINERY)
    }
  })

  it("names each week apart", () => {
    for (const season of [SAMPLE_SEASON, SEASON_2026]) {
      const titles = season.weeks.map((w) => uploadOf(season, w).title)
      expect(new Set(titles).size).toBe(titles.length)
    }
  })
})
