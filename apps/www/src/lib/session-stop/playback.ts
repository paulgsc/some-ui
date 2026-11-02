import { primaryOf, useOrchestratorStore } from "@/lib/orchestrator"

import type { Playback } from "./runtime"

/**
 * The app-wide orchestrator as a stop's playback port, on both surfaces. The
 * reflection drawer holds it through `holdable` below.
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

/** Lets go of a hold. Calling it again does nothing. */
export type Release = () => void

/**
 * `playback`, which something can hold still for a while: the reflection
 * drawer, open (#1870).
 *
 * While any hold is kept the session waits: paused underneath, its clock
 * still, but still playing as far as a stop can tell, if it was playing
 * when the hold began. So a stop taken behind the drawer keeps the session
 * as the person left it, and a resume a stop asks for meanwhile (a glance,
 * "Oops, keep going", "Pick up") waits for the last hold to go. Pausing or
 * ending it meanwhile is not deferred: the person or a stop wants it still,
 * so the last release leaves it still. A release resumes only a session
 * that is still paused there, never one that has ended.
 */
export function holdable(base: Playback): {
  playback: Playback
  hold: () => Release
} {
  const holds = new Set<symbol>()
  // Whether the session plays once nothing holds it.
  let wantsPlay = false

  const held = (): boolean => holds.size > 0
  // Starts it playing, then pauses it again underneath while it is held.
  const play = (run: () => void): void => {
    wantsPlay = true
    run()
    if (held()) base.pause()
  }

  const playback: Playback = {
    position: () => {
      const at = base.position()
      return at && held() ? { ...at, playing: wantsPlay } : at
    },
    pause: () => {
      wantsPlay = false
      base.pause()
    },
    resume: () => {
      wantsPlay = true
      if (!held()) base.resume()
    },
    start: () => {
      play(() => base.start())
    },
    restart: (elapsedMs, plannedMs) => {
      play(() => base.restart(elapsedMs, plannedMs))
    },
    end: () => {
      wantsPlay = false
      base.end()
    },
  }

  const hold = (): Release => {
    const token = Symbol("hold")
    if (!held()) {
      wantsPlay = base.position()?.playing === true
      if (wantsPlay) base.pause()
    }
    holds.add(token)
    return () => {
      if (!holds.delete(token) || held() || !wantsPlay) return
      if (base.position()?.playing === false) base.resume()
    }
  }

  return { playback, hold }
}
