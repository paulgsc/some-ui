
export type YouTubeRegion =
  | "video"
  | "title"
  | "mainContent"
  | "footerLeft"
  | "sidebarTop"
  | "sidebarBottom"
  | "footerRight"

// NOW: Constraints are in PIXELS, not ratios
export const defaultConstraints = new Map<YouTubeRegion, Constraint>([
  ["video", { ideal: 300, min: 200, max: 600 }],
  ["title", { ideal: 200, min: 150, max: 400 }],
  ["mainContent", { ideal: 250, min: 150, max: 500 }],
  ["sidebarTop", { ideal: 200, min: 150, max: 400 }],
  ["sidebarBottom", { ideal: 200, min: 150, max: 400 }],
  ["footerLeft", { ideal: 150, min: 100, max: 300 }],
  ["footerRight", { ideal: 150, min: 100, max: 300 }],
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
