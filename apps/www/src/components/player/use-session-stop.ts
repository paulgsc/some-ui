import { useEffect, useState } from "react"

import { hasAudience } from "@/lib/build-profile"
import { primaryOf, useOrchestratorStore } from "@/lib/orchestrator"
import type { Stop } from "@/lib/session-stop"
import {
  forgetStop,
  GLANCE_MS,
  hasLapsed,
  latestStop,
  msSinceStop,
  saveStop,
  settle,
} from "@/lib/session-stop"

/** Pauses a running session and keeps the stop; null when nothing ran. */
function stopPlayback(sessionId: string, via: Stop["via"]): Stop | null {
  const o = useOrchestratorStore.getState()
  if (!o.mode.is_running) return null
  void o.pause()
  const stop: Stop = {
    sessionId,
    stoppedAt: new Date().toISOString(),
    elapsedMs: o.clock.current_time,
    plannedMs: o.clock.total_duration,
    scene:
      primaryOf(o.lifetimes.scene_lifetimes)?.kind.Scene.scene_name ?? null,
    via,
    reason: null,
    reasonFrom: null,
    outcome: "open",
    settledAt: null,
  }
  saveStop(stop)
  return stop
}

/**
 * A session's stop, in the player: "Got to go", leaving the app (on the
 * phone; a desktop tab switch is not a stop), and coming back to either.
 * `begin` replaces the player's first start, so a session reopened with a
 * stop still open offers the pick-up, or closes as it stood once the window
 * has passed.
 */
export function useSessionStop(sessionId: string): {
  stop: Stop | null
  returning: boolean
  begin: () => void
  gotToGo: () => void
  pickUp: () => void
  callItDone: () => void
} {
  const [stop, setStop] = useState<Stop | null>(null)
  const [returning, setReturning] = useState(false)

  useEffect(() => {
    if (!hasAudience("apk")) return
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") {
        if (stop === null) setStop(stopPlayback(sessionId, "left"))
        setReturning(true)
      } else if (
        stop?.via === "left" &&
        msSinceStop(stop, new Date()) < GLANCE_MS
      ) {
        forgetStop(stop)
        setStop(null)
        void useOrchestratorStore.getState().resume()
      }
    }
    document.addEventListener("visibilitychange", onVisibility)
    return (): void => {
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [stop, sessionId])

  return {
    stop,
    returning,
    begin: (): void => {
      const open = latestStop(sessionId)
      const o = useOrchestratorStore.getState()
      if (open?.outcome !== "open") {
        void o.start()
      } else if (hasLapsed(open, new Date())) {
        setStop(settle(open, "lapsed"))
        void o.stop()
      } else {
        setStop(open)
        setReturning(true)
      }
    },
    gotToGo: (): void => {
      setStop(stopPlayback(sessionId, "tap"))
      setReturning(false)
    },
    pickUp: (): void => {
      if (stop === null) return
      const o = useOrchestratorStore.getState()
      // Before going anywhere, "keep going" undoes a mis-tap.
      if (returning) settle(stop, "resumed")
      else forgetStop(stop)
      if (o.mode.is_paused) {
        void o.resume()
      } else {
        // Reopened: the activity remounted, so it picks up at its start.
        void o.start()
        if (stop.scene !== null) void o.forceScene(stop.scene)
      }
      setStop(null)
      setReturning(false)
    },
    callItDone: (): void => {
      if (stop === null) return
      setStop(settle(stop, "done"))
      void useOrchestratorStore.getState().stop()
    },
  }
}
