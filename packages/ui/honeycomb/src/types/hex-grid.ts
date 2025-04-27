type HexPoint = {
  x: number
  y: number
}

export type HexRenderData = {
  id: string
  points: Array<HexPoint>
  color?: number
  content?: string
}
