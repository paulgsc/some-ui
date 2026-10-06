import { useEffect, useState, useSyncExternalStore } from "react"

import { hasAudience } from "@/lib/build-profile"
import { primaryOf, useOrchestratorStore } from "@/lib/orchestrator"
import type { StopState } from "@/lib/session-stop"
import type { Playback, StopRuntime } from "@/lib/session-stop/runtime"
import { createStopRuntime } from "@/lib/session-stop/runtime"

/** The orchestrator as a stop's playback port. */
const orchestrator: Playback = {
  position: () => {
    const o = useOrchestratorStore.getState()
    if (!o.mode.is_running && !o.mode.is_paused) return null
    return {
      elapsedMs: o.clock.current_time,
      plannedMs: o.clock.total_duration,
      scene:
        primaryOf(o.lifetimes.scene_lifetimes)?.kind.Scene.scene_name ?? null,
    }
  },
  pause: () => void useOrchestratorStore.getState().pause(),
  resume: () => void useOrchestratorStore.getState().resume(),
  start: () => void useOrchestratorStore.getState().start(),
  restart: (scene) => {
    const o = useOrchestratorStore.getState()
    void o.start()
    if (scene !== null) void o.forceScene(scene)
  },
  end: () => void useOrchestratorStore.getState().stop(),
}

/**
 * Wiring only: the runtime for this player mount, its state as a snapshot,
 * and leaving the app forwarded on the phone (a desktop tab switch is not a
 * stop).
 */
export function useSessionStop(sessionId: string): {
  state: StopState
  stops: StopRuntime
} {
  // eslint-disable-next-line owner-guard/no-mount-snapshot -- a runtime made once per mount; LivePlayer is keyed by session id
  const [stops] = useState(() => createStopRuntime(sessionId, orchestrator))
  useEffect(() => stops.connect(hasAudience("apk")), [stops])
  const state = useSyncExternalStore(
    stops.subscribe,
    stops.getState,
    stops.getState
  )
  return { state, stops }
}
