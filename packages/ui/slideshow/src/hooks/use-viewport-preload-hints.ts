import { useEffect, useMemo } from "react"
import type { ComponentRegistry, ViewportConfig } from "@some-ui/types"
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
export function useViewportPreloadHints({
  viewportConfig,
  cursor,
  facesAhead,
  registry,
}: UseViewportPreloadHintsArgs<string>): void {
  // Create a stable key that changes only when the actual kinds change
  const preloadKey = useMemo(() => {
    const { items, faceCapacity } = viewportConfig
    const currentFace = Math.floor(cursor / faceCapacity)

    const kinds = new Set<string>()

    for (let i = 1; i <= facesAhead; i++) {
      const faceIndex = currentFace + i
      const start = faceIndex * faceCapacity
      const end = Math.min(start + faceCapacity, items.length)

      for (let j = start; j < end; j++) {
        const kind = items[j]?.kind
        if (kind) {
          kinds.add(kind)
        }
      }
    }

    // Return sorted string key for stable comparison
    return Array.from(kinds).sort().join(",")
  }, [cursor, facesAhead, viewportConfig])

  useEffect(() => {
    if (!preloadKey) return

    const kinds = preloadKey.split(",")
    void preloadRegistryComponents(registry, kinds)
  }, [preloadKey, registry])
}
