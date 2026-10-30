/**
 * Text set into a box under the same character-count width model captions
 * use (`./lines`): a block's rows are decided here, in pure code, so the
 * preview, the recorder and a test agree on every break, and a block the
 * model accepts never overflows in the browser.
 */

import type { Box } from "./geometry"
import { charsOf, greedy } from "./lines"

const FONT_STACK = '"Barlow Condensed", "Arial Narrow", sans-serif'

export type TextStyle = {
  readonly family: string
  readonly weight: 600 | 800
  /** At 1080x1920. */
  readonly sizePx: number
  /** Line height as a multiple of the size. */
  readonly lineHeight: number
  /** An upper bound of the font's average advance, in ems (`./lines`). */
  readonly charWidthEm: number
  readonly colour: string
  readonly uppercase: boolean
}

/** A style in the burn-ins' one font, Barlow Condensed (SIL OFL 1.1). */
export const barlow = (
  weight: 600 | 800,
  sizePx: number,
  colour: string,
  lineHeight = 1.25
): TextStyle => ({
  family: FONT_STACK,
  weight,
  sizePx,
  lineHeight,
  // Upper bounds of the advance in mixed case, as captions' looks measure.
  charWidthEm: weight === 800 ? 0.5 : 0.48,
  colour,
  uppercase: false,
})

/** Some text, broken into rows, and the box it takes. */
export type TextBlock = {
  readonly box: Box
  readonly rows: ReadonlyArray<string>
  readonly style: TextStyle
}

/** Characters a row of `widthPx` holds in `style`. */
const rowChars = (style: TextStyle, widthPx: number): number =>
  Math.max(1, Math.floor(widthPx / (style.sizePx * style.charWidthEm)))

const words = (text: string): ReadonlyArray<{ readonly text: string }> =>
  text
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w) => ({ text: w }))

/**
 * `text` set from the top left of `at`, wrapped to its width, or null when
 * it takes more than `maxRows` rows (or a word wider than a row).
 */
export function setText(
  text: string,
  style: TextStyle,
  at: { readonly x: number; readonly y: number; readonly width: number },
  maxRows: number
): TextBlock | null {
  const chars = rowChars(style, at.width)
  const rows = greedy(words(text), chars)
  if (rows.length > maxRows || rows.some((r) => charsOf(r) > chars)) return null
  return {
    box: {
      x: at.x,
      y: at.y,
      width: at.width,
      height: rows.length * style.sizePx * style.lineHeight,
    },
    rows: rows.map((r) => r.map((w) => w.text).join(" ")),
    style,
  }
}

/**
 * `text` on one row at the largest size from `style`'s down to `floorPx`
 * (in steps of 2 px, as `render.py`'s `fit` did), or null when it fits on
 * none.
 */
export function fitLine(
  text: string,
  style: TextStyle,
  at: { readonly x: number; readonly y: number; readonly width: number },
  floorPx: number
): TextBlock | null {
  for (let size = style.sizePx; size >= floorPx; size -= 2) {
    const block = setText(text, { ...style, sizePx: size }, at, 1)
    if (block) return block
  }
  return null
}

/** Where a block ends, down the frame. */
export const bottomOf = (block: TextBlock): number =>
  block.box.y + block.box.height
