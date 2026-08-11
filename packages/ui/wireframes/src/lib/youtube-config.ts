// youtube-config.ts - Constraints that allow filling
import type { SlotId, YouTubeRegion } from "@some-ui/types"

export type { YouTubeRegion }

export type Constraint = {
  ideal: number // Preferred size
  min: number // Minimum size
  max: number // Maximum size (use Infinity to allow filling)
}

// Updated: min is minimum, max is Infinity to allow natural filling
export const defaultConstraints = new Map<YouTubeRegion, Constraint>([
  ["title", { ideal: 10, min: 5, max: Infinity }],
  ["video", { ideal: 300, min: 150, max: Infinity }],
  ["mainContent", { ideal: 400, min: 200, max: Infinity }],
  ["footerLeft", { ideal: 200, min: 100, max: Infinity }],
  ["footerRight", { ideal: 20, min: 10, max: Infinity }],
  ["sidebarTop", { ideal: 25, min: 12, max: Infinity }],
  ["sidebarBottom", { ideal: 25, min: 12, max: Infinity }],
])

export const regionColors: Record<YouTubeRegion, string> = {
  video: "bg-blue-100 border-blue-300",
  title: "bg-purple-100 border-purple-300",
  mainContent: "bg-green-100 border-green-300",
  sidebarTop: "bg-yellow-100 border-yellow-300",
  sidebarBottom: "bg-orange-100 border-orange-300",
  footerLeft: "bg-pink-100 border-pink-300",
  footerRight: "bg-cyan-100 border-cyan-300",
}

export const ALL_YOUTUBE_REGIONS: Array<YouTubeRegion> = [
  "video",
  "title",
  "mainContent",
  "footerLeft",
  "sidebarTop",
  "sidebarBottom",
  "footerRight",
]

// The neutral member of a fixed legend palette. `regionColors` above assigns
// each known slot its own literal pair (bg-cyan-100 border-cyan-300, …) so the
// wireframe reads as a color key; this is the "unclassified" swatch in that
// key, and a semantic token would make one entry drift away from the rest.
const DEFAULT_SLOT_COLOR = "bg-slate-100 border-slate-300"
const SLOT_COLOR_BY_ID = new Map<string, string>(Object.entries(regionColors))

/** `regionColors` only has entries for the known vocabulary; any other slot id falls back to a neutral color. */
export function getSlotColor(id: SlotId): string {
  return SLOT_COLOR_BY_ID.get(id) ?? DEFAULT_SLOT_COLOR
}
