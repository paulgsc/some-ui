import type { CSSProperties } from "react"
import { clamp01 } from "@burn-ins/lib/captions/frame"
import type { Box, FrameSize } from "@burn-ins/lib/geometry"
import { MONO_FAMILY } from "@burn-ins/lib/mono"

/** A frame's pixels as the stage draws them. */
export type Units = {
  /** Frame pixels as container units of the stage, which is the frame's width. */
  readonly cq: (px: number) => string
  /** A box of the frame, placed on the stage. */
  readonly placed: (box: Box) => CSSProperties
}

export const unitsOf = (frame: FrameSize): Units => {
  const cq = (px: number): string =>
    `${((px * 100) / frame.width).toFixed(4)}cqw`
  return {
    cq,
    placed: (box) => ({
      left: cq(box.x),
      top: cq(box.y),
      width: cq(box.width),
      height: cq(box.height),
    }),
  }
}

/** The cards' monospace at `sizePx`, a line `lineHeightPx` tall. */
export const monoType = (
  { cq }: Units,
  sizePx: number,
  lineHeightPx: number
): CSSProperties => ({
  fontFamily: MONO_FAMILY,
  fontWeight: 500,
  fontSize: cq(sizePx),
  lineHeight: cq(lineHeightPx),
})

/** A colour with an opacity, as #rrggbbaa. */
export const withAlpha = (hex: string, opacity: number): string =>
  `${hex}${Math.round(clamp01(opacity) * 255)
    .toString(16)
    .padStart(2, "0")}`
