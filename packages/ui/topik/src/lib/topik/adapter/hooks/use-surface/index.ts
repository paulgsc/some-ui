/**
 * Which renderer the applet mounts, decided by the room it was given.
 *
 * The threshold is not a taste in breakpoints. Below `md` the desktop
 * session stacks its transcript above its quiz, and a question is then
 * answered with the conversation it is about scrolled out of view - a
 * different exercise from the one the same question is on a wide screen
 * (adaptive-learning canon Prop. 9.4). Width below `md` is therefore exactly
 * where the desktop valuation stops being the one delivered, and where the
 * handheld renderer, whose valuation is declared (Cor. 4.4), takes over.
 *
 * Height counts too: a phone on its side is 780x390, wide enough to pass a
 * width test and far too short for a header, a transcript and a quiz. The
 * applet measures its own box rather than the viewport, since a host may
 * mount it in a pane.
 */

import type { RefObject } from "react"
import { useLayoutEffect, useState } from "react"

export type Surface = "desktop" | "handheld"
export type SurfacePreference = Surface | "auto"

/** Tailwind's `md`: where the desktop session stops fitting side by side. */
export const HANDHELD_MAX_WIDTH = 768
/** Below this the desktop header alone takes most of the height. */
export const HANDHELD_MAX_HEIGHT = 480

export type Box = { width: number; height: number }

/**
 * An unmeasured box (0x0 - jsdom, a hidden tab, the first frame) keeps the
 * desktop surface, which has always been the default; the handheld one is
 * chosen only on evidence that the room is small.
 */
export function chooseSurface({ width, height }: Box): Surface {
  if (width <= 0 || height <= 0) return "desktop"
  return width < HANDHELD_MAX_WIDTH || height < HANDHELD_MAX_HEIGHT
    ? "handheld"
    : "desktop"
}

/** Landscape handhelds lay the lesson out in two columns. */
export function isShort({ height }: Box): boolean {
  return height > 0 && height < HANDHELD_MAX_HEIGHT
}

export function useElementBox(ref: RefObject<HTMLElement | null>): Box {
  const [box, setBox] = useState<Box>({ width: 0, height: 0 })

  // Measured before paint, so a phone never shows one frame of the desktop
  // surface before switching.
  useLayoutEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === "undefined") return

    const measure = (): void => {
      const { width, height } = element.getBoundingClientRect()
      setBox((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height }
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return (): void => observer.disconnect()
  }, [ref])

  return box
}
