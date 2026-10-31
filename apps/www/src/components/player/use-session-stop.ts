import { useEffect, useState, useSyncExternalStore } from "react"

import { hasAudience } from "@/lib/build-profile"
import type { StopState } from "@/lib/session-stop"
import { orchestratorPlayback } from "@/lib/session-stop/playback"
import type { StopRuntime } from "@/lib/session-stop/runtime"
import { createStopRuntime } from "@/lib/session-stop/runtime"

/**
 * Wiring only: the runtime for this player mount, its state as a snapshot,
 * and which surface's leaving it listens for (`StopRuntime.connect`).
 */
export function useSessionStop(sessionId: string): {
  state: StopState
  stops: StopRuntime
} {
  const [stops] = useState(() =>
    // eslint-disable-next-line owner-guard/no-mount-snapshot -- a runtime made once per mount; LivePlayer is keyed by session id
    createStopRuntime(sessionId, orchestratorPlayback)
  )
  useEffect(
    () => stops.connect(hasAudience("apk") ? "phone" : "desktop"),
    [stops]
  )
  const state = useSyncExternalStore(
    stops.subscribe,
    stops.getState,
    stops.getState
  )
  return { state, stops }
}
