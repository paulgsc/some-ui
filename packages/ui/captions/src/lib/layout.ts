/**
 * Where a caption sits in a 1080x1920 short, in that frame's pixels.
 *
 * YouTube draws its own controls over a Short: the title, channel and sound
 * along the bottom, and the like, comment and share column down the right.
 * Words under them are hidden, so every caption stays inside `SAFE_AREA`.
 * The insets are generous rounded fractions of the frame rather than
 * YouTube's exact figures, which move with each app release and screen.
 */

import { charsOf } from "./lines"
import type { CaptionTheme } from "./theme"

export const FRAME = { width: 1080, height: 1920 } as const

/** Each inset, in pixels of the 1080x1920 frame, and why it is there. */
export const SAFE_INSETS = {
  /** 8%: the search and menu buttons along the top. */
  top: 154,
  /** 15%: the like, comment, share and sound column on the right. */
  right: 162,
  /** 20%: the title, channel, subscribe button and sound line. */
  bottom: 384,
  /** 6%: a margin so the words never touch the edge. */
  left: 65,
} as const

export type Box = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export const SAFE_AREA: Box = {
  x: SAFE_INSETS.left,
  y: SAFE_INSETS.top,
  width: FRAME.width - SAFE_INSETS.left - SAFE_INSETS.right,
  height: FRAME.height - SAFE_INSETS.top - SAFE_INSETS.bottom,
}

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
