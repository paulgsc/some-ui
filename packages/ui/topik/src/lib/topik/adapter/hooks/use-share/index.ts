/**
 * Wiring only: one share's runtime (`adapter/next-scene-share`) per mount,
 * its state read with `useSyncExternalStore`, and let go on unmount.
 */

import { useEffect, useState, useSyncExternalStore } from "react"
import type {
  FileShare,
  ShareState,
} from "@topik/lib/topik/adapter/next-scene-share"
import { ShareRuntime } from "@topik/lib/topik/adapter/next-scene-share"

export function useShare(share: FileShare): {
  state: ShareState
  start: ShareRuntime["start"]
} {
  const [runtime] = useState(() => new ShareRuntime(share))
  const state = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot
  )
  useEffect(() => runtime.dispose, [runtime])
  return { state, start: runtime.start }
}
