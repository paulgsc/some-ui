import type { LucideIcon } from "lucide-react"

export type Discipline = "structure" | "wiring" | "design" | "logic" | "freight"

export type BayStatus =
  | "surveying"
  | "welding"
  | "drilling"
  | "steady"
  | "paused"

export type WorkBay = {
  id: string
  /** Cube-coordinate cell id from the WASM hex grid this bay is pinned to. */
  cellId: string
  shortCode: string
  title: string
  description: string
  discipline: Discipline
  status: BayStatus
  crew: string
  eta: string
  /** Integer, 0..100. */
  completion: number
  siteTexture: string
  icon: LucideIcon
}

export type SiteSummary = {
  totalCompletion: number
  baysScheduled: number
  openBays: number
}

/**
 * Spec §16 state model. Kept explicit and small enough that illegal
 * combinations (a stock modal alongside a focused cell, a menu attached to
 * a bay that already collapsed) simply have no representation: `expanded`
 * is the only thing that can own primary territory, and it names the one
 * bay it belongs to.
 */
export type ExpandedMode = "workorder" | "actions"

export type ExpandedState = {
  bayId: string
  mode: ExpandedMode
  /** Where the interaction that opened this originated, for focus return. */
  anchor: "click" | "keyboard" | "contextmenu"
}

export type SiteUiState = {
  inspectedBayId: string | null
  pinnedDiscipline: Discipline | null
  expanded: ExpandedState | null
}
