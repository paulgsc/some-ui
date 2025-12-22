import type { ReactNode } from "react"
import { useMemo } from "react"
import type { RegionContentMap } from "@wireframes/components/layout-projection"
import { useResolvedContent } from "@wireframes/components/layout-projection"
import { RenderSolved } from "@wireframes/components/layout-renderer"
import type { SceneRegistry } from "@wireframes/hooks/orchestrator-integration"
import {
  useCurrentResolvedFocus,
  useFocusPruning,
  useResolvedUIIntent,
} from "@wireframes/hooks/orchestrator-integration"
import { useContainerRect } from "@wireframes/hooks/use-container-rect"
import type {
  Constraint,
  ConstraintKey,
  LayoutNode,
} from "@wireframes/lib/resizable-layout"
import { focusConstraints, solveLayout } from "@wireframes/lib/resizable-layout"
import type {
  ComponentRegistry,
  OrchestratorState,
  YouTubeRegion,
} from "some-types-utils"

/**
 * YouTube layout tree definition (static, client-owned)
 *
 * Defines the hierarchical structure of the YouTube-like interface:
 * - Title bar at top
 * - Main content area split into left (video + footer) and right (sidebar)
 */
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

/**
 * Default layout constraints (static)
 *
 * Defines ideal proportions for each region and split
 * These are adjusted dynamically based on focus state
 */
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

type OrchestratedViewportProps<K extends string> = {
  orchestratorState: OrchestratorState
  sceneRegistry: SceneRegistry
  componentRegistry: ComponentRegistry<K>
  transitionMs?: number
}

/**
 * OrchestratedYouTubeViewport
 *
 * Main orchestrated layout component that:
 * 1. Resolves UI intent from orchestrator state
 * 2. Syncs and resolves focus (server + client proposals)
 * 3. Resolves content from intent using registry renderer
 * 4. Computes focus-adjusted layout constraints
 * 5. Solves and renders the layout with smooth transitions
 *
 * This component is the integration point between:
 * - Orchestrator (state machine)
 * - Registry renderer (component resolution)
 * - Layout solver (constraint-based positioning)
 * - Focus system (dynamic layout adjustment)
 */
export const OrchestratedYouTubeViewport = <K extends string>({
  orchestratorState,
  sceneRegistry,
  componentRegistry,
  transitionMs = 300,
}: OrchestratedViewportProps<K>) => {
  const { ref, rect } = useContainerRect()

  // 1. Resolve UI intent from orchestrator state + scene registry
  const uiIntent = useResolvedUIIntent(orchestratorState, sceneRegistry)

  // 3. Prune expired focus proposals
  useFocusPruning()

  // 4. Get resolved focus (server + component proposals)
  const resolvedFocus = useCurrentResolvedFocus()

  // 5. Resolve content from intent + registry
  // Now uses shared renderRegistryComponent internally
  const content: RegionContentMap = useResolvedContent(
    uiIntent,
    componentRegistry
  )

  // 6. Compute focus-adjusted constraints
  const constraints = useMemo(
    () =>
      focusConstraints(
        youtubeTree,
        defaultConstraints,
        resolvedFocus?.region ?? null,
        resolvedFocus?.intensity ?? 0
      ),
    [resolvedFocus]
  )

  // 7. Solve layout based on constraints and container dimensions
  const layout = useMemo(() => {
    if (!rect) return null
    return solveLayout(youtubeTree, constraints, rect)
  }, [rect, constraints])

  // 8. Render leaf function - wraps content with transition styling
  const renderLeaf = useMemo(() => {
    const RenderLeaf = (id: YouTubeRegion): ReactNode => {
      return (
        <div className="bg-none relative size-full transition-all">
          {content[id] ?? <div className="w-full h-full" />}
        </div>
      )
    }
    return RenderLeaf
  }, [content])

  return (
    <div className="absolute inset-0 flex-1 size-full" ref={ref}>
      {layout && (
        <RenderSolved
          node={layout}
          renderLeaf={renderLeaf}
          transitionMs={transitionMs}
        />
      )}
    </div>
  )
}
