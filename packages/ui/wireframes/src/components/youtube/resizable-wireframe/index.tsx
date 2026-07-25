import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import type { JSX, ReactNode } from "react"
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
import { getSlotColor } from "@wireframes/lib/youtube-config"
import { cn, renderRegistryComponent } from "some-ui-utils"

/**
 * A region can be bound by more than one active lifetime at once - most
 * visibly during a scene-transition crossfade, where the outgoing and
 * incoming scene are briefly both "active" and can bind the same slot. Each
 * entry's `key` is `${lifetime.id}:${layoutIndex}` - lifetime id alone in
 * case one lifetime's scene defines the same region across more than one
 * `ui` layout entry (unusual, but not impossible) - stable across renders so
 * a mid-transition panel isn't remounted every tick.
 */
type PanelEntry = { key: string; render: () => ReactNode }

type Edge = "left" | "right" | "top" | "bottom"

type OrchestratedViewportProps<K extends string> = {
  /**
   * Layout tree from editor (defines topology)
   * This is the OUTPUT from your CRM editor
   */
  layoutTree: LayoutNode<SlotId> | null

  /**
   * Active lifetimes to render content from
   */
  activeLifetimes: Array<ActiveLifetime>

  componentRegistry: ComponentRegistry<K>

  /**
   * Enable focus feature
   */
  enableFocus?: boolean

  /**
   * Transition duration for animations
   */
  transitionMs?: number

  /**
   * Zero-collapse leaves with nothing bound, redistributing their space to
   * siblings (story 5). Callers editing topology directly (story 6's edit
   * mode) turn this off so there's still something to click on to bind.
   */
  collapseUnbound?: boolean

  /**
   * Right-click any leaf to reveal resize handles (story 7) - independent
   * of edit mode, works during normal playback. Omit to disable the
   * affordance entirely.
   */
  onLeafResize?: (
    id: SlotId,
    edge: Edge,
    deltaPx: number,
    containerSizePx: number
  ) => void

  /**
   * Plain values merged onto every rendered panel's own props, alongside
   * whatever the persisted scene already supplies - lets a caller thread
   * cross-cutting, runtime-only facts (e.g. a session identity, or whether
   * something else currently needs exclusive control) down to registry
   * components uniformly, regardless of which `registry_key` a given panel
   * happens to be. This component never interprets the values, only merges
   * them - so it stays unaware of what, if anything, is being injected.
   */
  extraProps?: Record<string, unknown>
}

function findSolvedRect<T>(node: SolvedNode<T>, id: T): Rect | null {
  if (node.type === "leaf") return node.id === id ? node.rect : null
  for (const child of node.children) {
    const found = findSolvedRect(child, id)
    if (found) return found
  }
  return null
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
  collapseUnbound = true,
  onLeafResize,
  extraProps,
}: OrchestratedViewportProps<K>): JSX.Element => {
  const { ref, rect } = useContainerRect()

  // Consumer manages its own focus state
  const focusControls = useFocusControls<SlotId>()

  const [popup, setPopup] = useState<{
    regionId: SlotId
    position: { x: number; y: number }
  } | null>(null)

  const [resizeArmedLeaf, setResizeArmedLeaf] = useState<SlotId | null>(null)

  // Merge panels per region from all active lifetimes
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
              {
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- persisted scene props are typed unknown; spreading is safe regardless of shape
                ...(panel.props as Record<string, unknown> | undefined),
                ...extraProps,
              },
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
  }, [activeLifetimes, componentRegistry, extraProps])

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
