import { useEffect, useState, useSyncExternalStore } from "react"

import { hasAudience } from "@/lib/build-profile"
import type { StopState } from "@/lib/session-stop"
import type { Release } from "@/lib/session-stop/playback"
import { holdable, orchestratorPlayback } from "@/lib/session-stop/playback"
import type { StopRuntime } from "@/lib/session-stop/runtime"
import { createStopRuntime } from "@/lib/session-stop/runtime"

/**
 * Wiring only: the runtime for this player mount, its state as a snapshot,
 * which surface's leaving it listens for (`StopRuntime.connect`), and `hold`,
 * which keeps the session waiting while the reflection drawer is open
 * (`holdable`).
 */
export function useSessionStop(sessionId: string): {
  state: StopState
  stops: StopRuntime
  hold: () => Release
} {
  const [{ stops, hold }] = useState(() => {
    const held = holdable(orchestratorPlayback)
    return {
      // eslint-disable-next-line owner-guard/no-mount-snapshot -- a runtime made once per mount; LivePlayer is keyed by session id
      stops: createStopRuntime(sessionId, held.playback),
      hold: held.hold,
    }
  })
  useEffect(
    () => stops.connect(hasAudience("apk") ? "phone" : "desktop"),
    [stops]
  )
  const state = useSyncExternalStore(
    stops.subscribe,
    stops.getState,
    stops.getState
  )
  return { state, stops, hold }
}
