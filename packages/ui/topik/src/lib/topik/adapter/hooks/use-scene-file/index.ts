/**
 * Wiring only: one scene-file runtime (`adapter/scene-file`) per mount, its
 * state read with `useSyncExternalStore`, and its read let go on unmount.
 */

import { useEffect, useState, useSyncExternalStore } from "react"
import type { SceneFileState } from "@topik/lib/topik/adapter/scene-file"
import { SceneFileRuntime } from "@topik/lib/topik/adapter/scene-file"

export function useSceneFile(): {
  state: SceneFileState
  open: SceneFileRuntime["open"]
} {
  const [runtime] = useState(() => new SceneFileRuntime())
  const state = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot
  )
  useEffect(() => runtime.cancel, [runtime])
  return { state, open: runtime.open }
}
