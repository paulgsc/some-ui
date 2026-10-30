/** @vitest-environment node */
import { SAMPLE } from "@burn-ins/lib/captions/sample"
import { THEME_IDS, THEMES } from "@burn-ins/lib/captions/theme"
import {
  captionsFor,
  groupCaptions,
  runtimeOf,
  type TimedWord,
} from "@burn-ins/lib/captions/timing"
import { describe, expect, it } from "vitest"

import { word } from "./word"

const said = (c: { rows: ReadonlyArray<ReadonlyArray<TimedWord>> }): string =>
  c.rows
    .flat()
    .map((x) => x.text)
    .join(" ")

describe("grouping words into captions", () => {
  it("breaks on a pause longer than the threshold", () => {
    const captions = groupCaptions(
      [
        {
          words: [
            word("third", 0, 200),
            word("and", 250, 400),
            word("eleven", 1000, 1300),
          ],
        },
      ],
      40
    )
    expect(captions.map(said)).toEqual(["third and", "eleven"])
  })

  it("breaks before a caption would last too long", () => {
    const words = Array.from({ length: 12 }, (_, i) =>
      word("go", i * 400, i * 400 + 300)
    )
    const captions = groupCaptions([{ words }], 80)
    expect(captions.length).toBeGreaterThan(1)
    for (const c of captions) {
      const ws = c.rows.flat()
      expect(ws.at(-1)!.endMs - ws[0]!.startMs).toBeLessThanOrEqual(3200)
    }
  })

  it("never spans two spoken lines", () => {
    const captions = groupCaptions(
      [{ words: [word("first", 0, 200)] }, { words: [word("down", 220, 400)] }],
      40
    )
    expect(captions.map(said)).toEqual(["first", "down"])
  })

  it("lingers after the last word, but never into the next caption", () => {
    const captions = groupCaptions(
      [{ words: [word("first", 0, 200)] }, { words: [word("down", 400, 600)] }],
      40
    )
    expect(captions.map((c) => [c.startMs, c.endMs])).toEqual([
      [0, 400],
      [400, 1100],
    ])
    expect(runtimeOf(captions)).toBe(1100)
    expect(runtimeOf([])).toBe(0)
  })

  it.each(THEME_IDS)("keeps every sample word, in order (%s)", (id) => {
    const captions = captionsFor(SAMPLE, THEMES[id])
    expect(captions.flatMap((c) => c.rows.flat())).toEqual(
      SAMPLE.flatMap((line) => line.words)
    )
  })
})
