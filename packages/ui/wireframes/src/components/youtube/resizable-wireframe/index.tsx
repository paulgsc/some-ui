import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import type { JSX, ReactNode } from "react"
import { cn } from "@some-ui/core-utils"
import type { ActiveLifetime, ComponentRegistry, SlotId } from "@some-ui/types"
import { withFocus } from "@wireframes/components/focus-enhancer"
import { FocusControlPopup } from "@wireframes/components/focus-popup"
import { LeafResizeHandles } from "@wireframes/components/leaf-resize-handles"
import { RenderSolved } from "@wireframes/components/render-solved"
import { useContainerRect } from "@wireframes/hooks/use-container-rect"
import { useFocusControls } from "@wireframes/hooks/use-focus-controls"
import { extractLeafIds } from "@wireframes/lib/layout-intent"
import type { Rect, SolvedNode } from "@wireframes/lib/layout-types"
import type { LayoutNode } from "@wireframes/lib/layout-weighted"
import { solveLayoutWithBindings } from "@wireframes/lib/layout-weighted"
import { renderRegistryComponent } from "@wireframes/lib/registry/renderer"
import { getSlotColor } from "@wireframes/lib/youtube-config"

/**
 * A region can be bound by several active lifetimes at once (a crossfade's
 * outgoing and incoming scenes). `key` is `${lifetime.id}:${layoutIndex}`,
 * since one scene may bind a region in several `ui` entries; it is stable so
 * a mid-transition panel is not remounted every tick.
 */
type PanelEntry = { key: string; render: () => ReactNode }

type Edge = "left" | "right" | "top" | "bottom"

type OrchestratedViewportProps<K extends string> = {
  /** Layout tree from the editor; defines topology. */
  layoutTree: LayoutNode<SlotId> | null

  activeLifetimes: Array<ActiveLifetime>

  componentRegistry: ComponentRegistry<K>

  enableFocus?: boolean

  transitionMs?: number

  /**
   * Zero-collapse leaves with nothing bound, giving their space to siblings.
   * Edit mode turns this off so there is still something to click to bind.
   */
  collapseUnbound?: boolean

  /**
   * Right-click any leaf to reveal resize handles, during normal playback
   * too. Omit to disable.
   */
  onLeafResize?: (
    id: SlotId,
    edge: Edge,
    deltaPx: number,
    containerSizePx: number
  ) => void
}

// Deliberately no `extraProps` bag merged onto every panel: a caller injecting
// per-panel props merges them into the lifetimes it passes in (see apps/www's
// scene-props adapter), so panels render with the props they came with.

function findSolvedRect<T>(node: SolvedNode<T>, id: T): Rect | null {
  if (node.type === "leaf") return node.id === id ? node.rect : null
  for (const child of node.children) {
    const found = findSolvedRect(child, id)
    if (found) return found
  }
  return null
}

/**
 * Renders active lifetimes' content into the editor's tree topology,
 * managing runtime geometry (focus, constraints).
 */
export const OrchestratedYouTubeViewport = <K extends string>({
  layoutTree,
  activeLifetimes,
  componentRegistry,
  enableFocus = true,
  transitionMs = 300,
  collapseUnbound = true,
  onLeafResize,
}: OrchestratedViewportProps<K>): JSX.Element => {
  const { ref, rect } = useContainerRect()

  const focusControls = useFocusControls<SlotId>()

  const [popup, setPopup] = useState<{
    regionId: SlotId
    position: { x: number; y: number }
  } | null>(null)

  const [resizeArmedLeaf, setResizeArmedLeaf] = useState<SlotId | null>(null)

  const mergedPanels = useMemo(() => {
    const panels: Partial<Record<SlotId, Array<PanelEntry>>> = {}

    for (const lifetime of activeLifetimes) {
      const scene = lifetime.kind.Scene
      if (!scene.ui) continue

      scene.ui.forEach((layout, layoutIndex) => {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        for (const [region, panel] of Object.entries(
          layout.panels ?? {}
        ) as Array<[SlotId, { registry_key: K; props?: unknown }]>) {
          const render = (): ReactNode =>
            renderRegistryComponent(
              componentRegistry,
              panel.registry_key,
              // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- scene props are typed unknown; spreading is safe regardless of shape
              (panel.props as Record<string, unknown> | undefined) ?? {},
              {
                enhanceComponent: withFocus(region),
                withErrorBoundary: true,
                withSuspense: true,
              }
            )

          panels[region] ??= []
          panels[region].push({ key: `${lifetime.id}:${layoutIndex}`, render })
        }
      })
    }

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return Object.fromEntries(
      Object.entries(panels).map(([k, entries]) => [
        k,
        (): ReactNode =>
          (entries ?? []).map((entry) => (
            <Fragment key={entry.key}>{entry.render()}</Fragment>
          )),
      ])
    ) as Record<SlotId, () => ReactNode>
  }, [activeLifetimes, componentRegistry])

  const layout: SolvedNode<SlotId> | undefined = useMemo(() => {
    if (!rect) return
    if (!layoutTree) return

    const boundLeafIds = collapseUnbound
      ? new Set(Object.keys(mergedPanels))
      : extractLeafIds(layoutTree)

    return solveLayoutWithBindings(
      layoutTree,
      boundLeafIds,
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
    mergedPanels,
    collapseUnbound,
  ])

  const handleLeafClick = useCallback(
    (id: SlotId, position: { x: number; y: number }) => {
      if (!enableFocus) return
      setPopup({ regionId: id, position })
    },
    [enableFocus]
  )

  const handleApplyFocus = useCallback(
    (regionId: SlotId, intensity: number) => {
      focusControls.setFocus(regionId, intensity)
      setPopup(null)
    },
    [focusControls]
  )

  const handleClosePopup = useCallback(() => {
    setPopup(null)
  }, [])

  const handleLeafContextMenu = useCallback(
    (id: SlotId) => {
      if (!onLeafResize) return
      setResizeArmedLeaf((prev) => (prev === id ? null : id))
    },
    [onLeafResize]
  )

  useEffect(() => {
    if (!resizeArmedLeaf) return

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") setResizeArmedLeaf(null)
    }

    window.addEventListener("keydown", handleKeyDown)
    return (): void => window.removeEventListener("keydown", handleKeyDown)
  }, [resizeArmedLeaf])

  const armedLeafRect =
    resizeArmedLeaf && layout ? findSolvedRect(layout, resizeArmedLeaf) : null

  const renderLeaf = useMemo(
    () =>
      // eslint-disable-next-line react/no-unstable-nested-components, react/display-name
      (id: SlotId): ReactNode => {
        if (typeof mergedPanels[id] !== "function")
          return (
            <div
              className={cn(
                "size-full inline-flex text-center items-center justify-center",
                getSlotColor(id)
              )}
            >
              <h3 className="text-lg font-bold uppercase">{id}</h3>
            </div>
          )
        return mergedPanels[id]()
      },
    [mergedPanels]
  )

  return (
    <div className="absolute inset-0 flex-1 size-full" ref={ref}>
      {layout && (
        <RenderSolved
          node={layout}
          renderLeaf={renderLeaf}
          onLeafClick={enableFocus ? handleLeafClick : undefined}
          onLeafContextMenu={onLeafResize ? handleLeafContextMenu : undefined}
          transitionMs={transitionMs}
        />
      )}

      {resizeArmedLeaf && armedLeafRect && onLeafResize && (
        <LeafResizeHandles
          leafId={resizeArmedLeaf}
          rect={armedLeafRect}
          onResize={onLeafResize}
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
