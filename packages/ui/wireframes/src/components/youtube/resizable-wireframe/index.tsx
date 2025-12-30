import { useCallback, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { withFocus } from "@wireframes/components/focus-enhancer"
import { FocusControlPopup } from "@wireframes/components/focus-popup"
import { RenderSolved } from "@wireframes/components/render-solved"
import type { SceneRegistry } from "@wireframes/hooks/orchestrator-integration"
import { useContainerRect } from "@wireframes/hooks/use-container-rect"
import { useFocusControls } from "@wireframes/hooks/use-focus-controls"
import type { SolvedNode } from "@wireframes/lib/layout-types"
import type { LayoutNode } from "@wireframes/lib/layout-weighted"
import { solveLayoutWithFocus } from "@wireframes/lib/layout-weighted"
import { regionColors } from "@wireframes/lib/youtube-config"
import type {
  ActiveLifetime,
  ComponentRegistry,
  YouTubeRegion,
} from "some-types-utils"
import { cn, renderRegistryComponent } from "some-ui-utils"

type OrchestratedViewportProps<K extends string> = {
  /**
   * Layout tree from editor (defines topology)
   * This is the OUTPUT from your CRM editor
   */
  layoutTree: LayoutNode<YouTubeRegion>

  /**
   * Active lifetimes to render content from
   */
  activeLifetimes: Array<ActiveLifetime>

  sceneRegistry: SceneRegistry
  componentRegistry: ComponentRegistry<K>

  /**
   * Enable focus feature
   */
  enableFocus?: boolean

  /**
   * Transition duration for animations
   */
  transitionMs?: number
}

/**
 * Consumer viewport that:
 * - Receives tree topology from editor
 * - Manages runtime geometry (focus, constraints)
 * - Renders content from active lifetimes
 */
export const OrchestratedYouTubeViewport = <K extends string>({
  layoutTree,
  activeLifetimes,
  componentRegistry,
  enableFocus = true,
  transitionMs = 300,
}: OrchestratedViewportProps<K>) => {
  const { ref, rect } = useContainerRect()

  // Consumer manages its own focus state
  const focusControls = useFocusControls<YouTubeRegion>()

  const [popup, setPopup] = useState<{
    regionId: YouTubeRegion
    position: { x: number; y: number }
  } | null>(null)

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
        () => factories.map((f) => f()),
      ])
    ) as Record<YouTubeRegion, () => ReactNode>
  }, [activeLifetimes, componentRegistry])

  const layout: SolvedNode<YouTubeRegion> | undefined = useMemo(() => {
    if (!rect) return

    return solveLayoutWithFocus(
      layoutTree,
      rect,
      enableFocus ? focusControls.focusedRegion : null,
      enableFocus ? focusControls.focusIntensity : 0
    )
  }, [
    layoutTree,
    rect,
    enableFocus,
    focusControls.focusedRegion,
    focusControls.focusIntensity,
  ])

  const handleLeafClick = useCallback(
    (id: YouTubeRegion, position: { x: number; y: number }) => {
      if (!enableFocus) return
      setPopup({ regionId: id, position })
    },
    [enableFocus]
  )

  const handleApplyFocus = useCallback(
    (regionId: YouTubeRegion, intensity: number) => {
      focusControls.setFocus(regionId, intensity)
      setPopup(null)
    },
    []
  )

  const handleClosePopup = useCallback(() => {
    setPopup(null)
  }, [])

  const renderLeaf = useMemo(() => {
    const RenderLeaf = (id: YouTubeRegion): ReactNode => {
      if (typeof mergedPanels[id] !== "function")
        return (
          <div
            className={cn(
              "size-full inline-flex text-center items-center justify-center",
              regionColors[id]
            )}
          >
            <h3 className="text-lg font-bold uppercase">{id}</h3>
          </div>
        )
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
          onLeafClick={enableFocus ? handleLeafClick : undefined}
          transitionMs={transitionMs}
        />
      )}

      {enableFocus && popup && (
        <FocusControlPopup
          regionId={popup.regionId}
          position={popup.position}
          onApply={handleApplyFocus}
          onClose={handleClosePopup}
        />
      )}
    </div>
  )
}
