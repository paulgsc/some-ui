import type { Stop, StopEffect, StopEvent, StopState } from "@/lib/session-stop"
import { latestStop, step, storeEffect } from "@/lib/session-stop"

/** The playback a stop pauses and picks up, behind a port. */
export type Playback = {
  /** Where it is, or null when nothing is playing or paused. */
  position: () =>
    | (Pick<Stop, "elapsedMs" | "plannedMs" | "scene"> & { playing: boolean })
    | null
  pause: () => void
  resume: () => void
  start: () => void
  /**
   * Starts again at `scene`'s beginning (the activity has remounted), with
   * the plan back at `plannedMs`: a "+5 min" lived only in the old engine.
   */
  restart: (scene: string | null, plannedMs: number) => void
  end: () => void
}

export type StopRuntime = {
  getState: () => StopState
  subscribe: (listener: () => void) => () => void
  begin: () => void
  tap: () => void
  pickUp: () => void
  done: () => void
  /** Leaving and coming back (if `watchVisibility`) and a minute clock. */
  connect: (watchVisibility: boolean) => () => void
}

/** One player mount's stop: runs `step` and its effects, owns the clock. */
export function createStopRuntime(
  sessionId: string,
  playback: Playback,
  now: () => Date = () => new Date()
): StopRuntime {
  let state: StopState = { kind: "none" }
  const listeners = new Set<() => void>()

  const run = (effect: StopEffect): void => {
    if (effect.kind === "restart")
      playback.restart(effect.scene, effect.plannedMs)
    else if (effect.kind === "pause") playback.pause()
    else if (effect.kind === "resume") playback.resume()
    else if (effect.kind === "start") playback.start()
    else if (effect.kind === "end") playback.end()
    else storeEffect(effect)
  }

  const dispatch = (event: StopEvent): void => {
    const [next, effects] = step(state, event)
    effects.forEach(run)
    if (next === state) return
    state = next
    listeners.forEach((listener) => listener())
  }

  const here = (type: "tap" | "hidden"): StopEvent => {
    const position = playback.position()
    if (position === null) return { type, stop: null, playing: false }
    const { playing, ...at } = position
    const stop: Stop = {
      sessionId,
      stoppedAt: now().toISOString(),
      ...at,
      via: "tap",
      reason: null,
      reasonFrom: null,
      outcome: "open",
      settledAt: null,
    }
    return { type, stop, playing }
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    begin: () =>
      dispatch({ type: "begin", latest: latestStop(sessionId), now: now() }),
    tap: () => dispatch(here("tap")),
    pickUp: () => dispatch({ type: "pickUp", now: now() }),
    done: () => dispatch({ type: "done", now: now() }),
    connect: (watchVisibility) => {
      const onVisibility = (): void =>
        dispatch(
          document.visibilityState === "hidden"
            ? here("hidden")
            : { type: "visible", now: now() }
        )
      if (watchVisibility) {
        document.addEventListener("visibilitychange", onVisibility)
      }
      const clock = setInterval(
        () => dispatch({ type: "tick", now: now() }),
        60_000
      )
      return () => {
        document.removeEventListener("visibilitychange", onVisibility)
        clearInterval(clock)
      }
    },
  }
}
