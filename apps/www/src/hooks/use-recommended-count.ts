import { useSyncExternalStore } from "react"
import {
  MAX_RECOMMENDED_COUNT,
  recommendedCount,
} from "@some-ui/activity-catalog"

function subscribe(onChange: () => void): () => void {
  window.addEventListener("resize", onChange)
  return (): void => window.removeEventListener("resize", onChange)
}

function snapshot(): number {
  return recommendedCount(window.innerWidth)
}

/**
 * `k` - how many activities the launcher may render, for the window it is in.
 *
 * `useSyncExternalStore` rather than a resize effect for one reason that
 * matters here: it compares snapshots with `Object.is`, and the snapshot is a
 * small integer. Dragging a window edge fires `resize` continuously and
 * re-renders the launcher exactly twice - once at each breakpoint it crosses.
 *
 * The server snapshot is the largest `k` any breakpoint asks for. A first
 * paint that shows four cards and settles to two on a phone is a wrong
 * layout for one frame; a first paint that shows two and grows to four is a
 * wrong layout *and* a card appearing under a finger that was already moving.
 */
export function useRecommendedCount(): number {
  return useSyncExternalStore(subscribe, snapshot, () => MAX_RECOMMENDED_COUNT)
}
