import type { LucideIcon } from "lucide-react"

export type Repository = {
  name: string
  description: string
  packages: Array<Package>
  expanded: boolean
}

export type Package = {
  id: string
  name: string
  description: string
  lastActivity: Date
  status: PackageStatus
  commitCount: number
  contributors: number
}

export type PackageStatus = {
  name: "flourishing" | "growing" | "stale" | "neglected" | "abandoned"
  icon: LucideIcon
  color: string
  bgColor: string
  borderColor: string
}

export type StatusLegendItem = {
  icon: LucideIcon
  label: string
  color: string
}
