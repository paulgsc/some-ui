import type { ReactNode } from "react"

enum WireframeRegion {
  VIDEO = "VIDEO", // Region 1
  MARQUEE = "MARQUEE", // Region 2
  MAIN_CONTENT = "MAIN_CONTENT", // Region 3
  FOOTER_LEFT = "FOOTER_LEFT", // Region 4
  SIDEBAR_TOP = "SIDEBAR_TOP", // Region 5
  SIDEBAR_BOTTOM = "SIDEBAR_BOTTOM", // Region 6
  FOOTER_RIGHT = "FOOTER_RIGHT", // Region 7
}

type WireframeContent = {
  [WireframeRegion.VIDEO]: ReactNode
  [WireframeRegion.MARQUEE]: ReactNode
  [WireframeRegion.MAIN_CONTENT]: ReactNode
  [WireframeRegion.FOOTER_LEFT]: ReactNode
  [WireframeRegion.SIDEBAR_TOP]: ReactNode
  [WireframeRegion.SIDEBAR_BOTTOM]: ReactNode
  [WireframeRegion.FOOTER_RIGHT]: ReactNode
}

export { WireframeRegion, WireframeContent }
