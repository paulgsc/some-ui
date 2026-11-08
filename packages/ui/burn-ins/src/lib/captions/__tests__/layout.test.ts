/** @vitest-environment node */
import { layoutCaption, measureFor } from "@burn-ins/lib/captions/layout"
import { SAMPLE } from "@burn-ins/lib/captions/sample"
import { sizedFor, THEME_IDS, THEMES } from "@burn-ins/lib/captions/theme"
import { captionsFor } from "@burn-ins/lib/captions/timing"
import { FRAMES, geometryOf, inside, PORTRAIT } from "@burn-ins/lib/geometry"
import { breakLines } from "@burn-ins/lib/lines"
import { describe, expect, it } from "vitest"

/** Every look in every frame burn-ins are drawn for. */
const CASES = FRAMES.flatMap((frame) =>
  THEME_IDS.map((id) => ({
    id,
    frame: `${frame.width}x${frame.height}`,
    g: geometryOf(frame),
  }))
)

describe("the safe area", () => {
  it.each(CASES)(
    "holds every sample caption, in the lower third ($id, $frame)",
    ({ id, g }) => {
      const theme = sizedFor(THEMES[id], g)
      for (const caption of captionsFor(SAMPLE, theme, g)) {
        const { box } = layoutCaption(caption.rows, theme, g)
        expect(inside(box, g.safeArea)).toBe(true)
        expect(inside(box, g.regions["lower-third"])).toBe(true)
      }
    }
  )

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

  it.each(CASES)(
    "sets type at the same size against the frame's shorter side ($id, $frame)",
    ({ id, g }) => {
      expect(g.typeScale).toBe(Math.min(g.frame.width, g.frame.height) / 1080)
      expect(sizedFor(THEMES[id], g).font.sizePx).toBe(
        THEMES[id].font.sizePx * g.typeScale
      )
    }
  )
})

describe("a line in the 16:9 video", () => {
  it("runs as wide as its safe area, wider than the short's", () => {
    const [short, wide] = FRAMES.map((f) => {
      const g = geometryOf(f)
      return measureFor(sizedFor(THEMES.gridiron, g), g).limit
    })
    expect(wide).toBeGreaterThan(short ?? Infinity)
  })
})
