/** One schema for every video: its intro, outro and music bed (#3476). */
import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { bookendProblems, SERIES_IDS } from "@video-render/bookends"
import { callFormat } from "@video-render/call"
import { CARDS_SERIES } from "@video-render/cards-essay"
import { reportFormat } from "@video-render/engagement-report-video"
import { essayFormat } from "@video-render/essay"
import type { Format } from "@video-render/format"
import { gameEssayFormat } from "@video-render/game-essay"
import { interviewEssayFormat } from "@video-render/interview-essay"
import { readSeries } from "@video-render/node"
import type { Series } from "@video-render/series"
import { TEMPLATE_IDS, templateFormat } from "@video-render/templates"
import { series } from "@video-render/testing"
import { describe, expect, it } from "vitest"

const SAMPLE = join(import.meta.dirname, "../sample/series")

/** The newest version of every show's template, by name. */
const FORMATS: ReadonlyArray<Format> = [
  callFormat(),
  essayFormat(),
  interviewEssayFormat(),
  gameEssayFormat(),
  reportFormat(),
  ...TEMPLATE_IDS.map(templateFormat),
]

async function seriesAt(id: string, version?: number): Promise<Series> {
  const read = await readSeries(join(SAMPLE, id), version)
  if (!read.ok) throw new Error(read.problems.join("; "))
  return read.value
}

describe("every video's bookends", () => {
  it("are policy for every series there is, and only those", async () => {
    const motion = join(import.meta.dirname, "../../../video-motion/series")
    const folders = [
      ...(await readdir(SAMPLE)),
      ...(await readdir(motion, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name),
    ]
    expect([...SERIES_IDS].sort()).toEqual(folders.sort())
  })

  it("are carried by every template's newest version, in the series it pins", async () => {
    for (const format of FORMATS) {
      const drawn = await seriesAt(format.series.id, format.series.version)
      expect([format.id, bookendProblems(drawn, format.shape)]).toEqual([
        format.id,
        [],
      ])
    }
  })

  it("are carried by the newest version of each series a cards essay is drawn in", async () => {
    for (const id of CARDS_SERIES)
      expect(bookendProblems(await seriesAt(id))).toEqual([])
  })

  it("name each one a version lacks, and a series the policy doesn't know", () => {
    const bare = series({ id: "cheat-sheet", version: 5, music: undefined })
    expect(bookendProblems(bare)).toEqual([
      "cheat-sheet v5: it lacks an intro carrying the brand, which every video in cheat-sheet carries (bookends.ts)",
      "cheat-sheet v5: it lacks an outro carrying the brand, which every video in cheat-sheet carries (bookends.ts)",
      "cheat-sheet v5: it lacks a music bed, which every video in cheat-sheet carries (bookends.ts)",
    ])
    expect(bookendProblems(series({ id: "new-show" }))).toEqual([
      "new-show v1: the series isn't in the bookend policy (bookends.ts' SERIES_IDS)",
    ])
    expect(
      bookendProblems(
        series({ id: "long-episode", music: undefined }),
        undefined
      )
    ).toEqual([])
  })
})
