/**
 * Cube-coordinate helpers matching the id format `@some-ui/honeycomb`'s WASM
 * grid emits (`hex_{x}_{y}_{z}`, see crates/some-hexagon/src/wasm_hex.rs) and
 * the six neighbor directions from crates/some-hexagon/src/lib.rs
 * (`CubeCoord::neighbors`). Kept in the feature layer, not the honeycomb
 * package, because it's only used here to drive the "neighbors yield space"
 * displacement — a UI-state concern the generic renderer doesn't own.
 */

export type CubeCoord = { x: number; y: number; z: number }

const CELL_ID_PATTERN = /^hex_(-?\d+)_(-?\d+)_(-?\d+)$/

export function parseCellId(id: string): CubeCoord | null {
  const match = CELL_ID_PATTERN.exec(id)
  if (!match?.[1] || !match[2] || !match[3]) return null
  return { x: Number(match[1]), y: Number(match[2]), z: Number(match[3]) }
}

export function cellId(coord: CubeCoord): string {
  return `hex_${coord.x}_${coord.y}_${coord.z}`
}

const NEIGHBOR_DIRECTIONS: ReadonlyArray<CubeCoord> = [
  { x: 1, y: -1, z: 0 },
  { x: 1, y: 0, z: -1 },
  { x: 0, y: 1, z: -1 },
  { x: -1, y: 1, z: 0 },
  { x: -1, y: 0, z: 1 },
  { x: 0, y: -1, z: 1 },
]

export function neighborIdsOf(id: string): ReadonlyArray<string> {
  const coord = parseCellId(id)
  if (!coord) return []
  return NEIGHBOR_DIRECTIONS.map((d) =>
    cellId({ x: coord.x + d.x, y: coord.y + d.y, z: coord.z + d.z })
  )
}
