/**
 * Where a caption sits in a 1080x1920 short, in that frame's pixels: centred
 * at the bottom of the safe area (`../geometry`), in the lower third.
 */

import { SAFE_AREA, type Box } from "@burn-ins/lib/geometry"
import type { HasText, Measure } from "@burn-ins/lib/lines"
import { rowText, widthOf } from "@burn-ins/lib/text"

import type { CaptionTheme } from "./theme"

/** How far above the safe area's bottom edge a caption's box ends. */
const CAPTION_LIFT_PX = 48

const padX = (theme: CaptionTheme): number => theme.plate?.padXPx ?? 0
const padY = (theme: CaptionTheme): number => theme.plate?.padYPx ?? 0

/**
 * A line's width in the theme's type at its size, from the font's advance
 * widths, against the safe area's width less the plate and the outline.
 */
export const measureFor = (theme: CaptionTheme): Measure => ({
  widthOf: (row: ReadonlyArray<HasText>) =>
    widthOf(rowText(row), theme.font, theme.font.letterSpacingEm),
  limit: SAFE_AREA.width - 2 * padX(theme) - theme.strokePx,
})

export type CaptionLayout = {
  /** The bound the caption is drawn inside; its text is centred in it. */
  readonly box: Box
  readonly fontPx: number
  readonly lineHeightPx: number
}

/**
 * The box for a caption's lines. A line too long for the theme's size (one
 * word wider than a line) shrinks the type until it fits, so a caption never
 * leaves the safe area.
 */
export function layoutCaption(
  rows: ReadonlyArray<ReadonlyArray<HasText>>,
  theme: CaptionTheme
): CaptionLayout {
  const { widthOf: rowPx, limit } = measureFor(theme)
  const longest = Math.max(1, ...rows.map(rowPx))
  const scale = Math.min(1, limit / longest)
  const fontPx = theme.font.sizePx * scale
  const lineHeightPx = fontPx * theme.font.lineHeight
  // `min` because `longest * (limit / longest)` can round above `limit`.
  const width =
    Math.min(limit, longest * scale) + 2 * padX(theme) + theme.strokePx
  const height = rows.length * lineHeightPx + 2 * padY(theme) + theme.strokePx
  return {
    box: {
      x: SAFE_AREA.x + (SAFE_AREA.width - width) / 2,
      y: SAFE_AREA.y + SAFE_AREA.height - CAPTION_LIFT_PX - height,
      width,
      height,
    },
    fontPx,
    lineHeightPx,
  }
}
