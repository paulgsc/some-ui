/** @vitest-environment node */
import { layoutCaption, measureFor } from "@burn-ins/lib/captions/layout"
import { SAMPLE } from "@burn-ins/lib/captions/sample"
import { THEME_IDS, THEMES } from "@burn-ins/lib/captions/theme"
import { captionsFor } from "@burn-ins/lib/captions/timing"
import { SAFE_AREA, type Box } from "@burn-ins/lib/geometry"
import { breakLines } from "@burn-ins/lib/lines"
import { describe, expect, it } from "vitest"

const inside = (box: Box, area: Box): boolean =>
  box.x >= area.x &&
  box.y >= area.y &&
  box.x + box.width <= area.x + area.width &&
  box.y + box.height <= area.y + area.height

describe("the safe area", () => {
  it.each(THEME_IDS)("holds every sample caption (%s)", (id) => {
    const theme = THEMES[id]
    for (const caption of captionsFor(SAMPLE, theme))
      expect(inside(layoutCaption(caption.rows, theme).box, SAFE_AREA)).toBe(
        true
      )
  })

  it.each(THEME_IDS)("shrinks a word too long for a line to fit (%s)", (id) => {
    const theme = THEMES[id]
    const layout = layoutCaption(
      [[{ text: "Supercalifragilisticexpialidocious-and-then-some" }]],
      theme
    )
    expect(layout.fontPx).toBeLessThan(theme.font.sizePx)
    expect(inside(layout.box, SAFE_AREA)).toBe(true)
  })

  it.each(THEME_IDS)("breaks by how wide the letters draw (%s)", (id) => {
    // As many narrow words as fit on one line; the same count of wide words,
    // with the same number of characters, does not.
    const measure = measureFor(THEMES[id])
    const run = (word: string, n: number): Array<{ text: string }> =>
      Array.from({ length: n }, () => ({ text: word }))
    let n = 1
    while (breakLines(run("lit", n + 1), measure).length === 1) n++
    expect(breakLines(run("lit", n), measure)).toHaveLength(1)
    expect(breakLines(run("MWM", n), measure).length).toBeGreaterThan(1)
  })
})
