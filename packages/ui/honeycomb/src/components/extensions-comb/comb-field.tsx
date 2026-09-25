import { memo, useLayoutEffect, useState } from "react"
import type { CSSProperties, JSX, RefObject } from "react"
import { useHexgridWasm } from "@honeycomb/hooks/use-hexgrid-wasm"
import type { HexPoint } from "@honeycomb/types/hex-grid"
import { getCellCountForHexagonalGridRadius } from "@honeycomb/utils/hexagon-math"

import { COMB_VIEWBOX, HEX, INSET } from "./geometry"

/**
 * Where the comb sits on screen: its centre within the root box, the root
 * box's size, and how many CSS pixels one comb viewBox unit covers.
 */
export type CombFrame = {
  width: number
  height: number
  cx: number
  cy: number
  scale: number
}

/**
 * Tracks the comb's on-screen frame from the stage box it is fitted into.
 *
 * Read from the stage rather than from the comb's own `<svg>` because the
 * stage exists before the geometry WASM has loaded, so the field can lay out
 * in the same frame the comb will. `HexGrid` letterboxes its drawing into
 * the stage and never draws larger than `COMB_VIEWBOX` CSS pixels, so the
 * comb's centre is the stage's centre and its scale is the smaller of the
 * two axis ratios, capped at 1.
 */
export function useCombFrame(
  rootRef: RefObject<HTMLElement | null>,
  stageRef: RefObject<HTMLElement | null>
): CombFrame | null {
  const [frame, setFrame] = useState<CombFrame | null>(null)

  useLayoutEffect(() => {
    const root = rootRef.current
    const stage = stageRef.current
    if (!root || !stage) return

    const measure = (): void => {
      const r = root.getBoundingClientRect()
      const s = stage.getBoundingClientRect()
      if (r.width === 0 || s.width === 0) return
      const next: CombFrame = {
        width: r.width,
        height: r.height,
        cx: s.left - r.left + s.width / 2,
        cy: s.top - r.top + s.height / 2,
        scale: Math.min(
          s.width / COMB_VIEWBOX.width,
          s.height / COMB_VIEWBOX.height,
          1
        ),
      }
      setFrame((prev) =>
        prev?.width === next.width &&
        prev.height === next.height &&
        prev.cx === next.cx &&
        prev.cy === next.cy &&
        prev.scale === next.scale
          ? prev
          : next
      )
    }

    measure()
    // Absent in jsdom and very old browsers; the field then keeps its first
    // frame, which is still correct until the window is resized.
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    observer.observe(stage)
    return (): void => observer.disconnect()
  }, [rootRef, stageRef])

  return frame
}

/**
 * How many rings the field needs so that no corner of the root box is left
 * bare: the farthest corner's distance from the comb centre, in cell pitches,
 * plus a ring of margin for the partial cells along the edge.
 */
function ringsToCover(frame: CombFrame): number {
  const dx = Math.max(frame.cx, frame.width - frame.cx)
  const dy = Math.max(frame.cy, frame.height - frame.cy)
  const pitch = Math.sqrt(3) * HEX * frame.scale
  return Math.max(2, Math.ceil(Math.hypot(dx, dy) / pitch) + 1)
}

function insetPath(points: Array<HexPoint>): string {
  const n = points.length
  if (n === 0) return ""
  const cx = points.reduce((sum, p) => sum + p.x, 0) / n
  const cy = points.reduce((sum, p) => sum + p.y, 0) / n
  return `${points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${cx + (p.x - cx) * INSET},${cy + (p.y - cy) * INSET}`
    )
    .join(" ")} Z`
}

/**
 * The honeycomb the comb sits in: the rest of the viewport, painted as more
 * of the same comb.
 *
 * Geometry comes from the same WASM grid, at the same `HEX` size and in the
 * same viewBox units, and the field's viewBox is placed so that its origin
 * lands on the comb's centre at the comb's scale. Every field cell therefore
 * sits exactly where the comb's lattice would put its next ring, and the
 * seven live cells read as the lit middle of one continuous comb rather than
 * as an object laid on a background.
 *
 * Inert by construction: `aria-hidden`, no pointer events, no focusable
 * content, no motion. It is scenery, faint and fading toward the edges, and
 * it must never compete with the cells that carry meaning.
 */
const Field = ({ frame }: { frame: CombFrame }): JSX.Element | null => {
  const rings = ringsToCover(frame)
  const { hexCells } = useHexgridWasm({
    cellCount: getCellCountForHexagonalGridRadius(rings),
    hexSize: HEX,
  })

  if (hexCells.length === 0 || frame.scale <= 0) return null

  const x = -frame.cx / frame.scale
  const y = -frame.cy / frame.scale
  const w = frame.width / frame.scale
  const h = frame.height / frame.scale

  const style: CSSProperties & { "--xcomb-fx": string; "--xcomb-fy": string } =
    {
      "--xcomb-fx": `${frame.cx}px`,
      "--xcomb-fy": `${frame.cy}px`,
    }

  return (
    <svg
      className="xcomb-field"
      viewBox={`${x} ${y} ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
      style={style}
    >
      <rect x={x} y={y} width={w} height={h} className="xcomb-field-wax" />
      {hexCells.map((cell) => (
        <path
          key={cell.id}
          d={insetPath(cell.points)}
          className="xcomb-field-cell"
        />
      ))}
    </svg>
  )
}

/** Memoised: the comb re-renders on every level change; the field never needs to. */
export const CombField = memo(Field)
