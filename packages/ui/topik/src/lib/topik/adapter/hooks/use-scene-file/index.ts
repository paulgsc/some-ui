/**
 * Wiring only: one picked-file runtime (`@some-ui/intent-kit`) per mount, its
 * state read with `useSyncExternalStore`, and its read let go on unmount.
 */

import { useEffect, useState, useSyncExternalStore } from "react"
import type { PickedFileState } from "@some-ui/intent-kit"
import { PickedFileRuntime } from "@some-ui/intent-kit"

export function useSceneFile(): {
  state: PickedFileState
  open: PickedFileRuntime["open"]
} {
  const [runtime] = useState(() => new PickedFileRuntime())
  const state = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot
  )
  useEffect(() => runtime.cancel, [runtime])
  return { state, open: runtime.open }
}
