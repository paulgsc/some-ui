import { useMemo } from "react"
import type { ReactNode } from "react"
import { withFocus } from "@wireframes/components/focus-enhancer"
import { RenderSolved } from "@wireframes/components/layout-renderer"
import type { SceneRegistry } from "@wireframes/hooks/orchestrator-integration"
import {
  useCurrentResolvedFocus,
  useFocusPruning,
} from "@wireframes/hooks/orchestrator-integration"
import { useContainerRect } from "@wireframes/hooks/use-container-rect"
import type {
  Constraint,
  ConstraintKey,
  LayoutNode,
  SolvedNode,
} from "@wireframes/lib/resizable-layout"
import { focusConstraints, solveLayout } from "@wireframes/lib/resizable-layout"
import type {
  ActiveLifetime,
  ComponentRegistry,
  YouTubeRegion,
} from "some-types-utils"
import { renderRegistryComponent } from "some-ui-utils"

// --- YouTube layout tree and default constraints ---
const youtubeTree: LayoutNode<YouTubeRegion> = {
  type: "split",
  axis: "col",
  splitId: "root",
  children: [
    { type: "leaf", id: "title" },
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

type OrchestratedViewportProps<K extends string> = {
  activeLifetimes: Array<ActiveLifetime>
  sceneRegistry: SceneRegistry
  componentRegistry: ComponentRegistry<K>
  transitionMs?: number
}

/**
 * OrchestratedYouTubeViewport
 *
 * Resolves panels for each region directly from active lifetimes.
 * Panel components themselves handle rendering of children.
 */
export const OrchestratedYouTubeViewport = <K extends string>({
  activeLifetimes,
  componentRegistry,
  transitionMs = 300,
}: OrchestratedViewportProps<K>) => {
  const { ref, rect } = useContainerRect()

  // Prune expired focus proposals
  useFocusPruning()
  const resolvedFocus = useCurrentResolvedFocus()

  // Merge panels per region from all active lifetimes
  const mergedPanels = useMemo(() => {
    const panels: Partial<Record<YouTubeRegion, Array<() => ReactNode>>> = {}

    for (const lifetime of activeLifetimes) {
      const scene = lifetime.kind.Scene
      if (!scene.ui) continue

      for (const layout of scene.ui) {
        for (const [region, panel] of Object.entries(
          layout.panels ?? {}
        ) as any) {
          if (!panel) continue

          const factory = () =>
            renderRegistryComponent(
              componentRegistry,
              panel.registry_key,
              panel.props ?? {},
              { enhanceComponent: withFocus(region) }
            )

          panels[region] ??= []
          panels[region]!.push(factory)
        }
      }
    }

    return Object.fromEntries(
      Object.entries(panels).map(([k, factories]) => [
        k,
        () => (
          <div className="size-full">
            {factories.map((f, i) => (
              <div key={i} className="size-full">
                {f()}
              </div>
            ))}
          </div>
        ),
      ])
    ) as Record<YouTubeRegion, () => ReactNode>
  }, [activeLifetimes, componentRegistry])

  const constraints = useMemo(
    () =>
      focusConstraints(
        youtubeTree,
        defaultConstraints,
        // "mainContent",
        // 1
        resolvedFocus?.region ?? null,
        resolvedFocus?.intensity ?? 0
      ),
    [resolvedFocus]
  )

  const layout: SolvedNode<YouTubeRegion> | undefined = useMemo(() => {
    if (!rect) return
    return solveLayout(youtubeTree, constraints, rect)
  }, [constraints, rect])

  const renderLeaf = useMemo(() => {
    const RenderLeaf = (id: YouTubeRegion): ReactNode => {
      if (!mergedPanels[id]) return <div className="size-full" />
      return mergedPanels[id]()
    }
    return RenderLeaf
  }, [mergedPanels])

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
