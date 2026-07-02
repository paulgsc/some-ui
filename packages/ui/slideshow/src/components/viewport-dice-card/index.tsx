import type { JSX } from "react"
import { Fragment } from "react"
import { useViewportPreloadHints } from "@slideshow/hooks/use-viewport-preload-hints"
import type { ComponentRegistry, ViewportConfig } from "some-types-utils"
import {
  hasRegistryKey,
  renderRegistryComponent,
  useViewport,
} from "some-ui-utils"

export type ViewportDiceCardProps<K extends string> = {
  viewportConfig: ViewportConfig
  registry: ComponentRegistry<K>
  facesAhead?: number
}

/**
 * ViewportDiceCard (flat mode)
 *
 * Responsibilities:
 * - Viewport timing / scheduling
 * - Serial face rendering (instant swap)
 * - Component registry resolution
 * - Preload hints
 *
 * Does NOT:
 * - Perform geometry or transforms
 * - Measure layout
 */
export const ViewportDiceCard = <K extends string>({
  viewportConfig,
  registry,
  facesAhead = 1,
}: ViewportDiceCardProps<K>): JSX.Element | null => {
  const { faces, state, isLoading, error } = useViewport(viewportConfig, {
    autoTick: true,
    tickIntervalMs: 100,
    autoRefresh: true,
  })

  // Preload upcoming faces
  useViewportPreloadHints({
    viewportConfig,
    cursor: state?.cursor ?? 0,
    facesAhead,
    registry,
  })

  if (isLoading || error || !state) {
    return null
  }

  // Determine active face
  const activeFace = faces.find((f) => f.isActive)
  if (!activeFace) return null

  return (
    <div className="relative size-full flex items-center justify-center">
      {activeFace.contentIndices.map((itemIndex) => {
        const descriptor = viewportConfig.items[itemIndex]
        if (!descriptor) return null
        const { kind, props } = descriptor
        if (!kind || !hasRegistryKey(registry, kind)) {
          return null
        }

        return (
          <Fragment key={itemIndex}>
            {renderRegistryComponent(registry, kind, props, {
              withSuspense: true,
              fallback: null,
            })}
          </Fragment>
        )
      })}
    </div>
  )
}
