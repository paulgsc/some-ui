import { checkNarration } from "@playoff-delta/lib/narration"
import { SAMPLE_SEASON, sampleWeekOf } from "@playoff-delta/lib/sample"
import { sampleFill } from "@playoff-delta/lib/sample-fill"
import {
  FORMAT_VERSION,
  VOICED_VERSION,
  type FormatKind,
} from "@playoff-delta/lib/show"
import { describe, expect, it } from "vitest"

const KINDS: ReadonlyArray<FormatKind> = ["legend", "week"]

describe("the sample season's fill (SFEED12)", () => {
  it.each(KINDS)("of the %s passes the narration's check", async (kind) => {
    const fill = await sampleFill(kind)
    const checked = await checkNarration(
      SAMPLE_SEASON,
      sampleWeekOf(kind),
      fill
    )
    expect(checked.ok ? [] : checked.problems).toEqual([])
  })

  it.each(KINDS)(
    "of the %s is in the format's newest version, which is voiced",
    async (kind) => {
      const { format } = await sampleFill(kind)
      expect(format.version).toBe(FORMAT_VERSION[kind])
      expect(format.version).toBeGreaterThanOrEqual(VOICED_VERSION)
    }
  )

  it("is of the legend and the sample's newest week", async () => {
    expect((await sampleFill("legend")).week).toBe(0)
    expect((await sampleFill("week")).week).toBe(
      Math.max(...SAMPLE_SEASON.weeks.map((w) => w.week))
    )
  })
})
