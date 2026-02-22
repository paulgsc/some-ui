export type HopeStatus = "pending" | "fulfilled" | "crushed"

export type Hope = {
  id: number
  description: string
  isLive: boolean
  status: HopeStatus
  joy: number
  team: string
  category: string
}

export type WeekHistoryEntry = {
  week: number
  change: number
  total: number
}

export type MoodEvent = {
  id: number
  index: number // discrete order within the season timeline
  week: number
  label: string // short label for chart tooltip
  description: string // full narrative for the card
  team: string
  category: string
  delta: number // change at this moment
  mood: number // resulting cumulative mood at this moment
  time?: string // optional clock e.g. "Q2 08:34"
}

export type FreshnessMetrics = {
  freshness: number // 0-100, where 100 is completely fresh
  lastUpdated: Date
  priority: "low" | "medium" | "high" | "critical"
}

export type SatelliteDataItem<T = unknown> = {
  id: string
  name: string
  data: T
} & FreshnessMetrics

export type RefreshCallbacks = {
  // Use unknown here instead of the default 'any'
  onSuccess?: (item: SatelliteDataItem) => void
  onFailure?: (error: Error, itemId: string) => void
  onStart?: (itemId: string) => void
}

export type ApiAdapter<T> = {
  refreshItem: (
    id: string,
    callbacks?: RefreshCallbacks
  ) => Promise<SatelliteDataItem<T>>
  refreshAll: (
    callbacks?: RefreshCallbacks
  ) => Promise<Array<SatelliteDataItem<T>>>
}

export type FilterType = "all" | "critical" | "hidden" | "fresh"
export type SortType = "freshness" | "priority" | "name" | "lastUpdated"

export type ViewportDimensions = {
  width: number
  height: number
}

export type GridDimensions = {
  cols: number
  rows: number
  maxItems: number
}

export type MockSatelliteData = {
  dataType: string
  orbitAltitude: number
  signalStrength: number
  batteryLevel: number
  nextPass: number
}
