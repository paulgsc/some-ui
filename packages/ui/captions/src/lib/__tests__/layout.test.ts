/** @vitest-environment node */
import { FRAME, layoutCaption, SAFE_AREA, type Box } from "@captions/lib/layout"
import { SAMPLE } from "@captions/lib/sample"
import { THEME_IDS, THEMES } from "@captions/lib/theme"
import { captionsFor } from "@captions/lib/timing"
import { describe, expect, it } from "vitest"

const inside = (box: Box, area: Box): boolean =>
  box.x >= area.x &&
  box.y >= area.y &&
  box.x + box.width <= area.x + area.width &&
  box.y + box.height <= area.y + area.height

describe("the safe area", () => {
  it("keeps clear of the bottom 20% and the right 15% of a 1080x1920 short", () => {
    expect(SAFE_AREA.y + SAFE_AREA.height).toBeLessThanOrEqual(
      FRAME.height * 0.8
    )
    expect(SAFE_AREA.x + SAFE_AREA.width).toBeLessThanOrEqual(
      FRAME.width * 0.85
    )
  })

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
})
