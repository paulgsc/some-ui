import type { NFLTeam } from "@nfl/components/nfl-team-icon"

export type DataItem = {
  name: NFLTeam
  value: number
  imageUrl?: string
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
