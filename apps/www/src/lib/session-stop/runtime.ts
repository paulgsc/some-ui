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
  /** Starts again `elapsedMs` in, with the plan back at `plannedMs`. */
  restart: (elapsedMs: number, plannedMs: number) => void
  end: () => void
}

export type StopRuntime = {
  getState: () => StopState
  subscribe: (listener: () => void) => () => void
  begin: () => void
  tap: () => void
  pickUp: () => void
  done: () => void
  /**
   * A minute clock, and leaving and coming back. On both surfaces the
   * returned cleanup (the player unmounting, by Back or a link) and the page
   * going away (`pagehide`: a tab closed, a reload, the app torn down) leave,
   * and the page shown again from the browser's cache comes back. On the
   * phone the app hidden and shown does too; a hidden desktop tab is a
   * normal way to work, so it is not a stop.
   */
  connect: (surface: Surface) => () => void
}

/** Which build the player runs in: `hasAudience("apk")`, read by the caller. */
export type Surface = "phone" | "desktop"

/** One player mount's stop: runs `step` and its effects, owns the clock. */
export function createStopRuntime(
  sessionId: string,
  playback: Playback,
  now: () => Date = () => new Date()
): StopRuntime {
  let state: StopState = { kind: "none" }
  // Whether this mount took the session over: a finished one never does.
  let begun = false
  const listeners = new Set<() => void>()

  const run = (effect: StopEffect): void => {
    if (effect.kind === "restart")
      playback.restart(effect.elapsedMs, effect.plannedMs)
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
    begin: (): void => {
      begun = true
      dispatch({
        type: "begin",
        sessionId,
        latest: latestStop(sessionId),
        now: now(),
      })
    },
    tap: () => dispatch(here("tap")),
    pickUp: () => dispatch({ type: "pickUp", now: now() }),
    done: () => dispatch({ type: "done", now: now() }),
    connect: (surface) => {
      const visibleEvent = (): StopEvent => ({ type: "visible", now: now() })
      // The player gone for good keeps a stop only once `begin` ran: not for
      // a finished session played again, nor in StrictMode's first cleanup,
      // which precedes it. Either way the app-wide orchestrator pauses, or it
      // plays on unseen.
      const leave = (): void => {
        if (begun) dispatch(here("hidden"))
        else playback.pause()
      }
      const onVisibility = (): void =>
        dispatch(
          document.visibilityState === "hidden"
            ? here("hidden")
            : visibleEvent()
        )
      const onPageShow = (event: PageTransitionEvent): void => {
        if (event.persisted) dispatch(visibleEvent())
      }
      if (surface === "phone") {
        document.addEventListener("visibilitychange", onVisibility)
      }
      window.addEventListener("pagehide", leave)
      window.addEventListener("pageshow", onPageShow)
      const clock = setInterval(
        () => dispatch({ type: "tick", now: now() }),
        60_000
      )
      return () => {
        document.removeEventListener("visibilitychange", onVisibility)
        window.removeEventListener("pagehide", leave)
        window.removeEventListener("pageshow", onPageShow)
        clearInterval(clock)
        leave()
      }
    },
  }
}
