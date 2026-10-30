/**
 * Text set into a box: a block's rows are decided here, in pure code, so the
 * preview, the recorder and a test agree on every break. A row's width is
 * the sum of its characters' advances in the font (`./advances`), plus a
 * margin for kerning, so a block this accepts never overflows in the
 * browser, however wide its letters.
 */

import { ADVANCES_600, ADVANCES_800, CHARS, WIDEST } from "./advances"
import type { Box } from "./geometry"
import { greedy } from "./lines"

const FONT_STACK = '"Barlow Condensed", "Arial Narrow", sans-serif'

export type TextStyle = {
  readonly family: string
  readonly weight: 600 | 800
  /** At 1080x1920. */
  readonly sizePx: number
  /** Line height as a multiple of the size. */
  readonly lineHeight: number
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
  colour,
  uppercase: false,
})

/** Some text, broken into rows, and the box it takes. */
export type TextBlock = {
  readonly box: Box
  readonly rows: ReadonlyArray<string>
  readonly style: TextStyle
}

const advances = (weight: 600 | 800): ReadonlyMap<string, number> => {
  const table = weight === 600 ? ADVANCES_600 : ADVANCES_800
  return new Map([...CHARS].map((c, i) => [c, table[i] ?? WIDEST]))
}

const ADVANCES = { 600: advances(600), 800: advances(800) } as const

/** Kerning only rarely widens a pair; this covers it. */
const KERNING_MARGIN = 1.03

/** How wide `text` draws in `style`, in pixels; a character the font lacks counts as its widest. */
function widthOf(text: string, style: TextStyle): number {
  const table = ADVANCES[style.weight]
  const shown = style.uppercase ? text.toUpperCase() : text
  let ems = 0
  for (const c of shown) ems += table.get(c) ?? WIDEST
  return ems * style.sizePx * KERNING_MARGIN
}

/** `text`'s words, filled greedily into rows `widthPx` wide. */
const wrap = (text: string, style: TextStyle, widthPx: number): Array<string> =>
  greedy(
    text
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .map((w) => ({ text: w })),
    (row) => widthOf(join(row), style) <= widthPx
  ).map(join)

const join = (row: ReadonlyArray<{ readonly text: string }>): string =>
  row.map((w) => w.text).join(" ")

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
  const rows = wrap(text, style, at.width)
  if (rows.length > maxRows || rows.some((r) => widthOf(r, style) > at.width))
    return null
  return {
    box: {
      x: at.x,
      y: at.y,
      width: at.width,
      height: rows.length * style.sizePx * style.lineHeight,
    },
    rows,
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
