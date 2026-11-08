/**
 * The band at a frame's foot that captions are drawn in (SFEED11, #2707): from
 * the top of the tallest caption any look draws, its most rows at its full
 * size, down to the frame's bottom edge. A stage that leaves this band empty
 * has no caption drawn over what it shows, whatever look its series names
 * (`@some-ui/video-render`'s CV1).
 */

import { geometryOf, type FrameSize } from "@burn-ins/lib/geometry"

import { captionTop } from "./layout"
import { sizedFor, THEME_IDS, THEMES } from "./theme"
import { MAX_ROWS } from "./timing"

/** The band's height in `frame`'s pixels, whole. */
export function captionSpace(frame: FrameSize): number {
  const g = geometryOf(frame)
  const top = Math.min(
    ...THEME_IDS.map((id) => captionTop(MAX_ROWS, sizedFor(THEMES[id], g), g))
  )
  return Math.ceil(frame.height - top)
}
