export type DataItem = {
  name: string
  value: number
}

export type BrickPosition = {
  x: number
  y: number
  width: number
  height: number
}

export type BrickData = {
  position: BrickPosition
  item?: DataItem
  maxValue: number
  minValue: number
  isBlank?: boolean
}

export type CrownPosition = {
  x: number
  y: number
  width: number
  height: number
}

export type ChartData = {
  bricks: Array<BrickData>
  crown_position: CrownPosition | null
  min_value: number
  max_value: number
}
