/**
 * Where a caption sits in a 1080x1920 short, in that frame's pixels: centred
 * at the bottom of the safe area (`../geometry`), in the lower third.
 */

import { SAFE_AREA, type Box } from "@burn-ins/lib/geometry"
import { charsOf } from "@burn-ins/lib/lines"

import type { CaptionTheme } from "./theme"

/** How far above the safe area's bottom edge a caption's box ends. */
const CAPTION_LIFT_PX = 48

const charPx = (theme: CaptionTheme, sizePx: number): number =>
  sizePx * (theme.font.charWidthEm + theme.font.letterSpacingEm)

const padX = (theme: CaptionTheme): number => theme.plate?.padXPx ?? 0
const padY = (theme: CaptionTheme): number => theme.plate?.padYPx ?? 0

/** Characters a line may hold in this theme, across the safe area. */
export const lineCharsFor = (theme: CaptionTheme): number =>
  Math.max(
    1,
    Math.floor(
      (SAFE_AREA.width - 2 * padX(theme) - theme.strokePx) /
        charPx(theme, theme.font.sizePx)
    )
  )

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
  rows: ReadonlyArray<ReadonlyArray<{ readonly text: string }>>,
  theme: CaptionTheme
): CaptionLayout {
  const longest = Math.max(1, ...rows.map((row) => charsOf(row)))
  const scale = Math.min(1, lineCharsFor(theme) / longest)
  const fontPx = theme.font.sizePx * scale
  const lineHeightPx = fontPx * theme.font.lineHeight
  const width =
    longest * charPx(theme, fontPx) + 2 * padX(theme) + theme.strokePx
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
