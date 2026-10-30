import type { CSSProperties } from "react"
import { clamp01 } from "@burn-ins/lib/captions/frame"
import { FRAME, type Box } from "@burn-ins/lib/geometry"

/** Frame pixels (of 1080 across) as container units of the stage. */
export const cq = (px: number): string =>
  `${((px * 100) / FRAME.width).toFixed(4)}cqw`

export const placed = (box: Box): CSSProperties => ({
  left: cq(box.x),
  top: cq(box.y),
  width: cq(box.width),
  height: cq(box.height),
})

/** A colour with an opacity, as #rrggbbaa. */
export const withAlpha = (hex: string, opacity: number): string =>
  `${hex}${Math.round(clamp01(opacity) * 255)
    .toString(16)
    .padStart(2, "0")}`
