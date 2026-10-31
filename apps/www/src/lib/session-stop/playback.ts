import { primaryOf, useOrchestratorStore } from "@/lib/orchestrator"

import type { Playback } from "./runtime"

/**
 * The app-wide orchestrator as a stop's playback port, on both surfaces.
 *
 * Anything else that holds the session still (the reflection drawer, #1870)
 * pauses and resumes through this same port, so a stop taken while it holds
 * reads `playing: false` and a glance leaves the session paused for it.
 */
export const orchestratorPlayback: Playback = {
  position: () => {
    const o = useOrchestratorStore.getState()
    if (!o.mode.is_running && !o.mode.is_paused) return null
    return {
      elapsedMs: o.clock.current_time,
      plannedMs: o.clock.total_duration,
      scene:
        primaryOf(o.lifetimes.scene_lifetimes)?.kind.Scene.scene_name ?? null,
      playing: o.mode.is_running,
    }
  },
  pause: () => void useOrchestratorStore.getState().pause(),
  resume: () => void useOrchestratorStore.getState().resume(),
  start: () => void useOrchestratorStore.getState().start(),
  restart: (elapsedMs, plannedMs) => {
    const o = useOrchestratorStore.getState()
    const lost = plannedMs - o.clock.total_duration
    void o.start()
    // The plan first, so the seek is not clamped short of a "+5 min".
    if (lost > 0) void o.extend(lost)
    void o.seek(elapsedMs)
  },
  end: () => void useOrchestratorStore.getState().stop(),
}
