/**
 * Where a caption sits in a frame, in that frame's pixels: centred at the
 * bottom of its safe area (`../geometry`), in the lower third. The theme is
 * the one sized for the frame (`sizedFor`).
 */

import type { Box, Geometry } from "@burn-ins/lib/geometry"
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
export const measureFor = (
  theme: CaptionTheme,
  geometry: Geometry
): Measure => ({
  widthOf: (row: ReadonlyArray<HasText>) =>
    widthOf(rowText(row), theme.font, theme.font.letterSpacingEm),
  limit: geometry.safeArea.width - 2 * padX(theme) - theme.strokePx,
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
  theme: CaptionTheme,
  geometry: Geometry
): CaptionLayout {
  const { widthOf: rowPx, limit } = measureFor(theme, geometry)
  const safe = geometry.safeArea
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
      x: safe.x + (safe.width - width) / 2,
      y: safe.y + safe.height - CAPTION_LIFT_PX - height,
      width,
      height,
    },
    fontPx,
    lineHeightPx,
  }
}
