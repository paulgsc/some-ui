import { useSyncExternalStore } from "react"
import type { TakePattern, TakePatternSnapshot } from "@some-ui/voice-capture"

/** Subscribes a component to a take pattern's runtime: wiring, nothing else. */
export function useTakePattern(pattern: TakePattern): TakePatternSnapshot {
  return useSyncExternalStore(pattern.subscribe, pattern.getSnapshot)
}
