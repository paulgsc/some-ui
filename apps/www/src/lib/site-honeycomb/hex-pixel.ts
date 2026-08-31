import { parseCellId } from "./cube-coord"

/**
 * Mirrors crates/some-hexagon/src/utils.rs's `hex_to_pixel` (pointy-top,
 * `x = size*sqrt3*(q + r/2)`, `y = size*1.5*r`) so this feature can compute
 * a cell's on-screen position independently of `HexGrid`'s internal
 * per-frame render pass — see focus-overlay.tsx for why that's needed.
 */
export const HEX_SIZE = 68
export const CELL_WIDTH = HEX_SIZE * Math.sqrt(3)
export const CELL_HEIGHT = HEX_SIZE * 2

export function cellCenter(cellId: string): { x: number; y: number } | null {
  const coord = parseCellId(cellId)
  if (!coord) return null
  const q = coord.x
  const r = coord.z
  return {
    x: HEX_SIZE * Math.sqrt(3) * (q + r / 2),
    y: HEX_SIZE * 1.5 * r,
  }
}
