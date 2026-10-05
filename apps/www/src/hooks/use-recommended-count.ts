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
 * `k`: how many activities the launcher may render for its window.
 * `useSyncExternalStore` compares the small-integer snapshot with `Object.is`,
 * so a window drag re-renders only at breakpoints. The server snapshot is the
 * largest `k`: shrinking after first paint beats a card appearing under a
 * moving finger.
 */
export function useRecommendedCount(): number {
  return useSyncExternalStore(subscribe, snapshot, () => MAX_RECOMMENDED_COUNT)
}
