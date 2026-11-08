/** @vitest-environment node */
import { layoutCaption, measureFor } from "@burn-ins/lib/captions/layout"
import { sizedFor, THEME_IDS, THEMES } from "@burn-ins/lib/captions/theme"
import {
  frameName,
  FRAMES,
  geometryOf,
  inside,
  PORTRAIT,
} from "@burn-ins/lib/geometry"
import { breakLines } from "@burn-ins/lib/lines"
import { describe, expect, it } from "vitest"

/** Every look in every frame burn-ins are drawn for. */
const CASES = FRAMES.flatMap((frame) =>
  THEME_IDS.map((id) => ({
    id,
    frame: frameName(frame),
    g: geometryOf(frame),
  }))
)

describe("the safe area", () => {
  it.each(CASES)(
    "holds two full rows of a look in the lower third ($id, $frame)",
    ({ id, g }) => {
      const theme = sizedFor(THEMES[id], g)
      const row = [{ text: "MMMM" }]
      const { box } = layoutCaption([row, row], theme, g)
      expect(inside(box, g.regions["lower-third"])).toBe(true)
    }
  )

  it.each(CASES)(
    "shrinks a word too long for a line to fit ($id, $frame)",
    ({ id, g }) => {
      const theme = sizedFor(THEMES[id], g)
      // Twice over in the 16:9 video, whose lines run nearly twice as wide.
      const word = "Supercalifragilisticexpialidocious-and-then-some"
      const layout = layoutCaption(
        [[{ text: g.frame === PORTRAIT ? word : word.repeat(2) }]],
        theme,
        g
      )
      expect(layout.fontPx).toBeLessThan(theme.font.sizePx)
      expect(inside(layout.box, g.safeArea)).toBe(true)
    }
  )

  it.each(CASES)(
    "breaks by how wide the letters draw ($id, $frame)",
    ({ id, g }) => {
      // As many narrow words as fit on one line; the same count of wide words,
      // with the same number of characters, does not.
      const measure = measureFor(sizedFor(THEMES[id], g), g)
      const run = (word: string, n: number): Array<{ text: string }> =>
        Array.from({ length: n }, () => ({ text: word }))
      let n = 1
      while (breakLines(run("lit", n + 1), measure).length === 1) n++
      expect(breakLines(run("lit", n), measure)).toHaveLength(1)
      expect(breakLines(run("MWM", n), measure).length).toBeGreaterThan(1)
    }
  )
})
