import type { Rect } from "@utils/types/resizable"
import type { YouTubeRegion } from "some-types-utils"
import { create } from "zustand"

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
  if (!regionId) return
  return useRegionRectStore((state) => state.rects.get(regionId))
}
