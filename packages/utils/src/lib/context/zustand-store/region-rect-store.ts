import type { YouTubeRegion } from "@some-ui/types"
import { create } from "zustand"

import type { Rect } from "../../../types/resizable"

type RegionRectState = {
  /** Map of region/split IDs to their current bounding rects */
  rects: Map<string, Rect>

  /** Set all rects at once (called by layout publisher) */
  setRects: (rects: Map<string, Rect>) => void

  /** Get rect for a specific region */
  getRect: (id: YouTubeRegion) => Rect | undefined

  /** Clear all rects (useful for unmount/cleanup) */
  clear: () => void
}

export const useRegionRectStore = create<RegionRectState>((set, get) => ({
  rects: new Map(),

  setRects: (rects): void => set({ rects: new Map(rects) }),

  getRect: (id): Rect | undefined => get().rects.get(id),

  clear: (): void => set({ rects: new Map() }),
}))

/**
 * Hook to subscribe to a specific region's rect
 * Returns undefined if rect doesn't exist yet
 */
export function useRegionRect(
  regionId: YouTubeRegion | undefined
): Rect | undefined {
  // The selector, not the hook, is what is conditional here. Returning
  // early before the `useRegionRectStore` call meant a component whose
  // `regionId` went from set to undefined rendered a different number of
  // hooks than the render before it, which React rejects outright.
  return useRegionRectStore((state) =>
    regionId ? state.rects.get(regionId) : undefined
  )
}
