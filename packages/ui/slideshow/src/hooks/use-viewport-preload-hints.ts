import { useEffect, useMemo } from "react"
import type { ComponentRegistry, ViewportConfig } from "some-types-utils"
import { preloadRegistryComponents } from "some-ui-utils"

type UseViewportPreloadHintsArgs<K extends string> = {
  viewportConfig: ViewportConfig
  cursor: number
  facesAhead: number
  registry: ComponentRegistry<K>
}

/**
 * useViewportPreloadHints
 *
 * Preloads components for upcoming viewport faces
 *
 * Strategy:
 * - Looks ahead N faces from current cursor position
 * - Collects unique component kinds in those faces
 * - Delegates to preloadRegistryComponents for actual preloading
 *
 * This prevents loading spinners when components come into view
 *
 * Separation of concerns:
 * - This hook: Viewport-aware lookahead calculation
 * - preloadRegistryComponents: Generic batch preloading
 */
export function useViewportPreloadHints<K extends string>({
  viewportConfig,
  cursor,
  facesAhead,
  registry,
}: UseViewportPreloadHintsArgs<K>) {
  // Create a stable key that changes only when the actual kinds change
  const preloadKey = useMemo(() => {
    const { items, faceCapacity } = viewportConfig
    const currentFace = Math.floor(cursor / faceCapacity)

    const kinds = new Set<K>()

    for (let i = 1; i <= facesAhead; i++) {
      const faceIndex = currentFace + i
      const start = faceIndex * faceCapacity
      const end = Math.min(start + faceCapacity, items.length)

      for (let j = start; j < end; j++) {
        const kind = items[j]?.kind as K | undefined
        if (kind) {
          kinds.add(kind)
        }
      }
    }

    // Return sorted string key for stable comparison
    return Array.from(kinds).sort().join(",")
  }, [cursor, facesAhead, viewportConfig.items, viewportConfig.faceCapacity])

  useEffect(() => {
    if (!preloadKey) return

    const kinds = preloadKey.split(",") as Array<K>
    preloadRegistryComponents(registry, kinds)
  }, [preloadKey, registry])
}
