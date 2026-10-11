import { useSyncExternalStore } from "react"

import type { ReflectionsSnapshot } from "."
import { reflections } from "."

/** The kept reflections and shared marks; re-renders when either changes. */
export function useReflections(): ReflectionsSnapshot {
  return useSyncExternalStore(
    reflections.subscribe,
    reflections.getSnapshot,
    reflections.getSnapshot
  )
}
