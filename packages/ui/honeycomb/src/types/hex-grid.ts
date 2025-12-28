export type HexPoint = {
  x: number
  y: number
}

export type HexCellTheme = {
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
  filter?: string
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
