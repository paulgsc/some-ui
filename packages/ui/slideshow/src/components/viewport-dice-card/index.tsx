import { Fragment, useCallback } from "react"
import { CubeGeometry } from "@slideshow/components/cube-geometry"
import { useViewportPreloadHints } from "@slideshow/hooks/use-viewport-preload-hints"
import type { ComponentRegistry, ViewportConfig } from "some-types-utils"
import { BorderBeam } from "some-ui-shared"
import {
  renderRegistryComponent,
  useCycleRotationAdapter,
  useViewport,
} from "some-ui-utils"

export type ViewportDiceCardProps<K extends string> = {
  viewportConfig: ViewportConfig
  registry: ComponentRegistry<K>
  perspective?: number
  className?: string
  faceClassName?: string
  showBeam?: boolean
  hideBackface?: boolean
  facesAhead?: number
}

/**
 * ViewportDiceCard - Pure geometry + scheduling renderer
 *
 * Responsibilities:
 * - Viewport timing/scheduling (via useViewport)
 * - 3D geometry/rotation (via CubeGeometry)
 * - Component registry resolution
 * - Preload hints for upcoming faces
 *
 * Does NOT:
 * - Define content rendering logic
 * - Include loading UI chrome
 * - Make state-based component decisions
 */
export const ViewportDiceCard = <K extends string>({
  viewportConfig,
  registry,
  perspective,
  className,
  faceClassName,
  showBeam = true,
  hideBackface = false,
  facesAhead = 1,
}: ViewportDiceCardProps<K>) => {
  const { faces, state, isLoading, error } = useViewport(viewportConfig, {
    autoTick: true,
    tickIntervalMs: 100,
    autoRefresh: true,
  })

  const { xRotation, yRotation } = useCycleRotationAdapter({
    cyclePosition: state?.cyclePosition ?? 0,
    cycleLength: state?.cycleLength ?? faces.length,
    axis: state?.cycleName ?? "cube:y",
  })

  /**
   * Accumulated duration of the currently visible face
   */
  const faceDurationMs = useCallback(() => {
    if (!state?.cursor) return 0

    const { items, faceCapacity } = viewportConfig
    const faceIndex = Math.floor(state.cursor / faceCapacity)

    const start = faceIndex * faceCapacity
    const end = start + faceCapacity

    return items
      .slice(start, end)
      .reduce((sum, item) => sum + item.durationMs, 0)
  }, [state?.cursor, viewportConfig])

  // Preload upcoming face components (side-effect only)
  useViewportPreloadHints({
    viewportConfig,
    cursor: state?.cursor ?? 0,
    facesAhead,
    registry,
  })

  // Minimal early return - upstream decides rendering
  if (isLoading || error || !state) {
    return null
  }

  return (
    <CubeGeometry
      perspective={perspective}
      xRotation={xRotation}
      yRotation={yRotation}
      className={className}
      faceClassName={faceClassName}
      hideBackface={hideBackface}
      faces={faces.map((face, faceIndex) => ({
        key: faceIndex,
        content: (
          <div className="relative size-full">
            {showBeam && face.isActive && (
              <BorderBeam size={16} duration={faceDurationMs() / 1_000} />
            )}

            {face.contentIndices.map((itemIndex) => {
              const descriptor = viewportConfig.items[itemIndex]
              const { kind, props } = descriptor
              if (!kind) return null

              // Use shared registry renderer with minimal policy
              return (
                <Fragment key={itemIndex}>
                  {renderRegistryComponent(registry, kind as K, props, {
                    withSuspense: true,
                    fallback: null,
                  })}
                </Fragment>
              )
            })}
          </div>
        ),
      }))}
    />
  )
}
