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
