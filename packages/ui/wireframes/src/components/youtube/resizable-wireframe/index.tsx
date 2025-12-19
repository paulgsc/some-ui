import type { FC, ReactNode } from "react"
import { useCallback, useMemo } from "react"
import { RenderSolved } from "@wireframes/components/layout-renderer"
import { useContainerRect } from "@wireframes/hooks/use-container-rect"
import type {
  Constraint,
  ConstraintKey,
  LayoutNode,
} from "@wireframes/lib/resizable-layout"
import { focusConstraints, solveLayout } from "@wireframes/lib/resizable-layout"

export type YouTubeRegion =
  | "video"
  | "title"
  | "mainContent"
  | "footerLeft"
  | "sidebarTop"
  | "sidebarBottom"
  | "footerRight"

type YouTubeContent = Partial<Record<YouTubeRegion, ReactNode>>

type YouTubeWireframeProps = {
  content?: YouTubeContent
  focusRegion?: YouTubeRegion | null
  focusIntensity?: number // 0 to 1 (0 = normal, 1 = fully focused)
  transitionMs?: number
  onRegionClick?: (region: YouTubeRegion) => void
}

const youtubeTree: LayoutNode<YouTubeRegion> = {
  type: "split",
  axis: "col",
  splitId: "root",
  children: [
    {
      type: "leaf",
      id: "title",
    },
    {
      type: "split",
      axis: "row",
      splitId: "content",
      children: [
        {
          type: "split",
          axis: "col",
          splitId: "leftCol",
          children: [
            {
              type: "split",
              axis: "row",
              splitId: "left-content",
              children: [
                { type: "leaf", id: "video" },
                { type: "leaf", id: "mainContent" },
              ],
            },
            {
              type: "split",
              axis: "row",
              splitId: "footer",
              children: [
                { type: "leaf", id: "footerLeft" },
                { type: "leaf", id: "footerRight" },
              ],
            },
          ],
        },
        {
          type: "split",
          axis: "col",
          splitId: "rightCol",
          children: [
            { type: "leaf", id: "sidebarTop" },
            { type: "leaf", id: "sidebarBottom" },
          ],
        },
      ],
    },
  ],
}

const defaultConstraints = new Map<ConstraintKey<YouTubeRegion>, Constraint>([
  ["title", { ideal: 8, min: 0, max: 100 }],
  ["content", { ideal: 88, min: 0, max: 100 }],
  ["left-content", { ideal: 85, min: 0, max: 100 }],
  ["rightCol", { ideal: 20, min: 0, max: 100 }],
  ["footer", { ideal: 15, min: 0, max: 100 }],
  ["leftCol", { ideal: 80, min: 0, max: 100 }],
  ["video", { ideal: 20, min: 0, max: 100 }],
  ["footerLeft", { ideal: 5, min: 0, max: 100 }],
  ["mainContent", { ideal: 80, min: 0, max: 100 }],
  ["footerRight", { ideal: 95, min: 0, max: 100 }],
  ["sidebarTop", { ideal: 30, min: 0, max: 100 }],
  ["sidebarBottom", { ideal: 70, min: 0, max: 100 }],
])

Object.freeze(defaultConstraints)

export const YouTubeWireframe: FC<YouTubeWireframeProps> = ({
  content = {},
  focusRegion = null,
  focusIntensity = 1,
  transitionMs = 300,
  onRegionClick,
}) => {
  const { ref, rect } = useContainerRect()

  const constraints = useMemo(
    () =>
      focusConstraints(
        youtubeTree,
        defaultConstraints,
        focusRegion,
        focusIntensity
      ),
    [focusRegion, focusIntensity]
  )

  const layout = useMemo(() => {
    if (!rect) return null

    // Solve layout with focused constraints
    return solveLayout(youtubeTree, constraints, rect)
  }, [rect, constraints])

  const renderLeaf = useCallback(
    (id: YouTubeRegion) => {
      return (
        <div className={`relative size-full transition-all`}>{content[id]}</div>
      )
    },
    [content]
  )

  return (
    <div className="absolute inset-0 flex-1 size-full" ref={ref}>
      {layout && (
        <RenderSolved
          node={layout}
          renderLeaf={renderLeaf}
          onLeafClick={onRegionClick}
          transitionMs={transitionMs}
        />
      )}
    </div>
  )
}
