/**
 * How the stages' captioned frame sets text (`apps/www`'s
 * `web-surface/call`), shared by the weekly call's model (`./call-fit`, CF1)
 * and the essay's (`./essay-fit`, EF1): glyph advances, line heights and
 * greedy wrapping, in CSS px at the 1920×1080 frame the recorder draws.
 */

/** The frame's font size: the stage's `1.5cqw`, at 1920 px wide. */
const BASE = 28.8

/**
 * A line's height per em: the stage's 1.5, with room for a line that mixes
 * in the monospace face, whose line box is a little taller (measured 1.53).
 */
const LINE = 1.56

/**
 * Each printable ASCII glyph's advance, from the space (32) to the tilde
 * (126), in thousandths of an em: the widest of the stage's sans face on
 * each host that records it, regular (`SANS`) and semibold or bold
 * (`SANS_BOLD`). The frame names no face of its own (`ui-sans-serif,
 * system-ui, sans-serif`), so each host draws its own: Inter in a cloud
 * session, and WenQuanYi Zen Hei in home's render image (the Playwright
 * 1.62.1 noble image `infra/render/Dockerfile` pins), measured 2026-11-14.
 */
// prettier-ignore
const SANS = [
  300, 300, 466, 634, 642, 982, 680, 300, 365, 365, 600, 662, 300, 460, 300,
  520, 631, 600, 610, 618, 646, 608, 621, 600, 619, 621, 300, 302, 662, 662,
  662, 540, 966, 704, 655, 731, 722, 602, 591, 747, 744, 269, 571, 672, 566,
  904, 754, 765, 639, 765, 644, 642, 646, 745, 704, 1008, 683, 679, 629, 365,
  520, 365, 600, 500, 380, 562, 613, 572, 613, 584, 335, 614, 592, 243, 243,
  549, 243, 876, 591, 600, 613, 613, 391, 528, 320, 592, 563, 819, 546, 563,
  553, 427, 333, 427, 662,
] as const

// prettier-ignore
const SANS_BOLD = [
  300, 338, 552, 649, 655, 1016, 680, 339, 377, 377, 600, 679, 334, 468, 334,
  520, 675, 600, 630, 646, 677, 640, 650, 600, 651, 650, 334, 343, 679, 679,
  679, 560, 1017, 760, 662, 740, 723, 608, 588, 751, 748, 281, 585, 720, 566,
  932, 763, 771, 648, 777, 657, 655, 668, 736, 760, 1058, 739, 731, 665, 377,
  520, 377, 600, 500, 380, 581, 631, 589, 631, 596, 361, 632, 623, 271, 271,
  581, 271, 913, 623, 614, 631, 631, 414, 561, 335, 623, 600, 851, 581, 603,
  573, 469, 372, 469, 679,
] as const

/** Any other glyph's advance, in em: the widest measured (an em dash, an arrow). */
const OTHER = 1.02

/** The monospace face's advance, in em: 0.602 in a session, 0.5 at home. */
const MONO = 0.61

/** The capitals' tracking, `tracking-wide`, in em per glyph. */
const TRACKING = 0.025

/**
 * How a run is set: the sans face regular, semibold or bold, its capitals
 * (taken at bold), or the monospace face.
 */
export type Face = "prose" | "bold" | "caps" | "mono"

/** One glyph's advance in `face`, in em. */
function advance(glyph: string, face: Face): number {
  if (face === "mono") return MONO
  const code = glyph.codePointAt(0) ?? 0
  const table = face === "prose" ? SANS : SANS_BOLD
  const sans = code >= 32 && code <= 126 ? table[code - 32] : undefined
  const em = sans === undefined ? OTHER : sans / 1000
  return face === "caps" ? em + TRACKING : em
}

/** A word's width in `face` at `em`, in px. */
export function widthOf(word: string, face: Face, em: number): number {
  const set = face === "caps" ? word.toUpperCase() : word
  let sum = 0
  for (const glyph of set) sum += advance(glyph, face)
  return sum * em * BASE
}

export const px = (em: number): number => em * BASE

export const lineOf = (em: number): number => px(em) * LINE

export type Run = {
  readonly text: string
  readonly face: Face
  /** Its font size, in em of the frame's. */
  readonly em: number
  /** Space before it, in px, on the same line: a margin or a gap. */
  readonly before?: number
  /**
   * Whether it continues the word the run before it ends with, as "`Vec`;"
   * does: no break and no gap between them. A run otherwise starts a word,
   * after its own space or `before`.
   */
  readonly touches?: boolean
}

/**
 * The words `runs` break into, each with the gap before it: a break falls at
 * whitespace and between runs, except before a run that `touches` the one
 * before it.
 */
function wordsOf(
  runs: ReadonlyArray<Run>
): ReadonlyArray<{ readonly w: number; readonly gap: number }> {
  const words: Array<{ w: number; gap: number }> = []
  let current: { w: number; gap: number } | null = null
  let gap = 0
  for (const run of runs) {
    if (run.touches !== true) {
      current = null
      gap = run.before ?? widthOf(" ", run.face, run.em)
    }
    for (const piece of run.text.split(/(\s+)/)) {
      if (piece.length === 0) continue
      if (/^\s+$/.test(piece)) {
        current = null
        gap = widthOf(" ", run.face, run.em)
        continue
      }
      if (current === null) {
        current = { w: 0, gap: words.length === 0 ? 0 : gap }
        words.push(current)
      }
      current.w += widthOf(piece, run.face, run.em)
    }
  }
  return words
}

/**
 * How many lines `runs` wrap to in `width` px, greedily by word, a word
 * wider than a line broken across lines as `overflow-wrap: anywhere` does.
 */
export function linesOf(runs: ReadonlyArray<Run>, width: number): number {
  let lines = 1
  let x = 0
  for (const { w, gap } of wordsOf(runs)) {
    if (x > 0 && x + gap + w > width) {
      lines += 1
      x = 0
    }
    x += x > 0 ? gap + w : w
    while (x > width) {
      lines += 1
      x -= width
    }
  }
  return lines
}

/** A part of a scene: its height, and its font size, in em of the frame's. */
export type Part = { readonly h: number; readonly em: number }

/**
 * Parts stacked as `space-y-[<gap>em]` stacks them (0.6 unless given): each
 * but the last with a margin below of `gap` em of its own font size.
 */
export const stack = (parts: ReadonlyArray<Part>, gap = 0.6): number =>
  parts.reduce(
    (sum, part, i) =>
      sum + part.h + (i < parts.length - 1 ? gap * px(part.em) : 0),
    0
  )
