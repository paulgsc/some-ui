export type HexPoint = {
  x: number
  y: number
}

type HexCellTheme = {
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
  filter?: string
  /**
   * Styles the cell path from a stylesheet. A CSS `fill` / `stroke` outranks
   * the presentation attributes above, which is what lets a cell take its
   * paint from design tokens instead of literals.
   */
  className?: string
}

export type HexCellData<T = unknown> = {
  data: T
  theme: HexCellTheme
}

export type HexRenderData<T = unknown> = {
  id: string
  points: Array<HexPoint>
  color?: number
  content?: HexCellData<T>
}
