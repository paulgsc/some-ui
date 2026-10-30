/**
 * The frame at time `t`: which caption is up, the word being said, and how
 * far each word has popped in. A pure function of (captions, theme, t), so
 * the preview page and the renderer recording a short draw the same thing at
 * the same moment, and a test can check any moment without a clock.
 */

import { layoutCaption, type CaptionLayout } from "./layout"
import type { CaptionTheme } from "./theme"
import type { Caption } from "./timing"

/** Said already, being said, or still to come. */
type WordState = "said" | "now" | "ahead"

type FrameWord = {
  readonly text: string
  /** When it is said; also what tells two words apart. */
  readonly startMs: number
  readonly state: WordState
  /** Pop-in progress, 0 (not shown) to 1 (settled). */
  readonly pop: number
}

export type CaptionFrame =
  | { readonly caption: null }
  | {
      /** The caption's index in the list. */
      readonly caption: number
      readonly rows: ReadonlyArray<ReadonlyArray<FrameWord>>
      readonly layout: CaptionLayout
    }

/** `x` held to the range 0 to 1. */
export const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))

export function frameAt(
  captions: ReadonlyArray<Caption>,
  theme: CaptionTheme,
  t: number
): CaptionFrame {
  const index = captions.findIndex((c) => c.startMs <= t && t < c.endMs)
  const caption = captions[index]
  if (caption === undefined) return { caption: null }
  // The word being said is the last one started: between two words the
  // highlight stays on the one just said rather than blinking off.
  const words = caption.rows.flat()
  let now = -1
  words.forEach((w, i) => {
    if (w.startMs <= t) now = i
  })
  const { popInMs } = theme.effects
  let i = 0
  const rows = caption.rows.map((row) =>
    row.map((w): FrameWord => {
      const at = i++
      return {
        text: w.text,
        startMs: w.startMs,
        state: at < now ? "said" : at === now ? "now" : "ahead",
        pop: popInMs === 0 ? 1 : clamp01((t - w.startMs) / popInMs),
      }
    })
  )
  return { caption: index, rows, layout: layoutCaption(caption.rows, theme) }
}

/**
 * How a word draws at a pop-in progress: it grows from 60% with a slight
 * overshoot (an ease-out-back curve) and fades in over the first third.
 */
export function popLook(pop: number): {
  readonly scale: number
  readonly opacity: number
} {
  const p = clamp01(pop)
  const c1 = 1.70158
  const c3 = c1 + 1
  const back = 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2
  return { scale: 0.6 + 0.4 * back, opacity: clamp01(p * 3) }
}
